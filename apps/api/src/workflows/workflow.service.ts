import type { WorkflowGraph } from "@workflow/contracts";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { CredentialProvider, ExecutionStatus, Prisma, WorkflowVersionStatus } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { WorkspaceService } from "../workspaces/workspace.service";
import { assertExecutableGraph, parseStoredWorkflowGraph, parseWorkflowGraph, validatePublishableGraph } from "./workflow-graph";
import { systemWorkflowTemplates } from "./system-templates";
import { GmailTriggerService } from "../scheduler/gmail-trigger.service";
import { RssTriggerService } from "../scheduler/rss-trigger.service";
import { CalendarTriggerService, calendarTargets } from "../scheduler/calendar-trigger.service";
import { ProviderPollService } from "../scheduler/provider-poll.service";
import { providerPollTargets } from "../scheduler/provider-poll-target";
import { canResumeRssCheckpoint, rssFeedUrlHash, rssTargets } from "../scheduler/rss-trigger-poller";
import { lockGraphCredentials } from "../credentials/credential-references";

type CreateWorkflowInput = { name: string; description?: string; graph?: unknown };
type UpdateDraftInput = { name?: string; description?: string | null; graph: unknown };

const defaultGraph: WorkflowGraph = {
  nodes: [{ id: "manual", type: "trigger.manual", position: { x: 120, y: 180 }, config: {} }],
  edges: [],
};

@Injectable()
export class WorkflowService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(WorkspaceService) private readonly workspaces: WorkspaceService, @Optional() @Inject(GmailTriggerService) private readonly gmailTriggers?: GmailTriggerService, @Optional() @Inject(RssTriggerService) private readonly rssTriggers?: RssTriggerService, @Optional() @Inject(CalendarTriggerService) private readonly calendarTriggers?: CalendarTriggerService, @Optional() @Inject(ProviderPollService) private readonly providerPoll?: ProviderPollService) {}

  async list(workspaceId: string, userId: string) {
    await this.workspaces.requireOwner(workspaceId, userId);
    const workflows = await this.prisma.workflow.findMany({
      where: { workspaceId, archivedAt: null },
      include: { draftVersion: true, publishedVersion: true },
      orderBy: { updatedAt: "desc" },
    });
    return workflows.map((workflow) => this.serialize(workflow));
  }

  async listArchived(workspaceId: string, userId: string) {
    await this.workspaces.requireOwner(workspaceId, userId);
    const workflows = await this.prisma.workflow.findMany({
      where: { workspaceId, archivedAt: { not: null } },
      include: { draftVersion: true, publishedVersion: true },
      orderBy: { updatedAt: "desc" },
    });
    return workflows.map((workflow) => this.serialize(workflow));
  }

  listTemplates() {
    return systemWorkflowTemplates.map((template) => ({
      slug: template.slug,
      name: template.name,
      description: template.description,
      tags: template.tags,
      requiredConnections: template.requiredConnections,
      nodeTypes: template.graph.nodes.map((node) => node.type),
    }));
  }

  async createFromTemplate(workspaceId: string, userId: string, slug: string) {
    const template = systemWorkflowTemplates.find((candidate) => candidate.slug === slug);
    if (!template) throw new NotFoundException({ code: "WORKFLOW_TEMPLATE_NOT_FOUND", message: "Workflow template was not found." });
    return this.create(workspaceId, userId, { name: template.name, description: template.description, graph: template.graph });
  }

  async create(workspaceId: string, userId: string, input: CreateWorkflowInput) {
    await this.workspaces.requireOwner(workspaceId, userId);
    const graph = input.graph === undefined ? defaultGraph : parseWorkflowGraph(input.graph);
    const workflow = await this.prisma.$transaction(async (transaction) => {
      await lockGraphCredentials(transaction, workspaceId, graph);
      const created = await transaction.workflow.create({ data: { workspaceId, name: input.name, description: input.description ?? null } });
      const draft = await transaction.workflowVersion.create({
        data: { workflowId: created.id, version: 1, status: WorkflowVersionStatus.DRAFT, graph: graph as Prisma.InputJsonValue },
      });
      const linked = await transaction.workflow.update({
        where: { id: created.id },
        data: { draftVersionId: draft.id },
        include: { draftVersion: true, publishedVersion: true },
      });
      await transaction.auditLog.create({ data: { workspaceId, actorId: userId, action: "workflow.created", targetType: "workflow", targetId: created.id } });
      return linked;
    });
    return this.serialize(workflow);
  }

  async get(workflowId: string, userId: string) {
    const workflow = await this.findOwned(workflowId, userId);
    return this.serialize(workflow);
  }

  async getFailureAlert(workflowId: string, userId: string) {
    const workflow = await this.findOwned(workflowId, userId);
    return { provider: workflow.failureAlertProvider, credentialId: workflow.failureAlertCredentialId, chatId: workflow.failureAlertChatId };
  }

  async updateFailureAlert(workflowId: string, userId: string, input: Record<string, unknown>) {
    const workflow = await this.findOwned(workflowId, userId);
    const provider = input.provider;
    if (provider !== null && provider !== "google_chat" && provider !== "telegram") throw new BadRequestException({ code: "INVALID_INPUT", message: "Choose Google Chat, Telegram, or turn alerts off." });
    const credentialId = provider === null ? null : input.credentialId;
    if (provider !== null && (typeof credentialId !== "string" || !credentialId.trim())) throw new BadRequestException({ code: "INVALID_INPUT", message: "Select a connection." });
    const chatId = provider === "telegram" ? input.chatId : null;
    if (provider === "telegram" && (typeof chatId !== "string" || !/^-?[1-9]\d{0,15}$/.test(chatId.trim()) || !Number.isSafeInteger(Number(chatId.trim())))) throw new BadRequestException({ code: "INVALID_INPUT", message: "Enter a valid Telegram chat ID." });
    await this.prisma.$transaction(async (tx) => {
      if (typeof credentialId === "string") {
        const rows = await tx.$queryRaw<Array<{ provider: string }>>`SELECT provider::text AS provider FROM "Credential" WHERE id = ${credentialId} AND "workspaceId" = ${workflow.workspaceId} FOR SHARE`;
        const expected = provider === "google_chat" ? CredentialProvider.GOOGLE_CHAT_WEBHOOK : CredentialProvider.TELEGRAM_BOT;
        if (rows[0]?.provider !== expected) throw new BadRequestException({ code: "CREDENTIAL_NOT_FOUND", message: "Choose a matching connection in this workspace." });
      }
      await tx.workflow.update({ where: { id: workflowId }, data: { failureAlertProvider: provider as string | null, failureAlertCredentialId: credentialId as string | null, failureAlertChatId: typeof chatId === "string" ? chatId.trim() : null } });
      await tx.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "workflow.failure_alert_updated", targetType: "workflow", targetId: workflowId, metadata: { provider } } });
    });
    return this.getFailureAlert(workflowId, userId);
  }

  async gmailTriggerStatus(workflowId: string, userId: string) {
    const workflow = await this.findOwned(workflowId, userId);
    if (!workflow.publishedVersion) return { active: false, checkpoints: [] };
    const checkpoints = await this.prisma.gmailTriggerCheckpoint.findMany({ where: { workflowVersionId: workflow.publishedVersion.id }, select: { nodeId: true, state: true, lastErrorCode: true, updatedAt: true } });
    if (workflow.isActive) for (const node of parseStoredWorkflowGraph(workflow.publishedVersion.graph).nodes.filter((item) => item.type === "trigger.gmail")) {
      if (!checkpoints.some((checkpoint) => checkpoint.nodeId === node.id)) checkpoints.push({ nodeId: node.id, state: "ERROR", lastErrorCode: "GMAIL_CHECKPOINT_MISSING", updatedAt: new Date() });
    }
    return { active: workflow.isActive, checkpoints };
  }

  async rssTriggerStatus(workflowId: string, userId: string) {
    const workflow = await this.findOwned(workflowId, userId);
    if (!workflow.publishedVersion) return { active: false, checkpoints: [] };
    const checkpoints = await this.prisma.$queryRaw<Array<{ nodeId: string; state: string; lastErrorCode: string | null; nextPollAt: Date | null; lastCheckedAt: Date | null; updatedAt: Date }>>`SELECT "nodeId", "state", "lastErrorCode", "nextPollAt", "lastCheckedAt", "updatedAt" FROM "RssTriggerCheckpoint" WHERE "workflowId" = ${workflowId} AND "workflowVersionId" = ${workflow.publishedVersion.id}`;
    if (workflow.isActive) for (const node of parseStoredWorkflowGraph(workflow.publishedVersion.graph).nodes.filter((item) => ["trigger.rss.new-item", "trigger.steam.game-news"].includes(item.type))) {
      if (!checkpoints.some((checkpoint) => checkpoint.nodeId === node.id)) checkpoints.push({ nodeId: node.id, state: "ERROR", lastErrorCode: "RSS_CHECKPOINT_MISSING", nextPollAt: null, lastCheckedAt: null, updatedAt: new Date() });
    }
    return { active: workflow.isActive, checkpoints };
  }

  async calendarTriggerStatus(workflowId: string, userId: string) {
    const workflow = await this.findOwned(workflowId, userId);
    if (!workflow.publishedVersion) return { active: workflow.isActive, checkpoints: [] };
    const checkpoints = await this.prisma.calendarTriggerCheckpoint.findMany({ where: { workflowId, workflowVersionId: workflow.publishedVersion.id }, select: { nodeId: true, state: true, lastErrorCode: true, updatedAt: true } });
    if (workflow.isActive) for (const node of parseStoredWorkflowGraph(workflow.publishedVersion.graph).nodes.filter((item) => item.type === "trigger.google-calendar.event")) if (!checkpoints.some((checkpoint) => checkpoint.nodeId === node.id)) checkpoints.push({ nodeId: node.id, state: "ERROR", lastErrorCode: "CALENDAR_CHECKPOINT_MISSING", updatedAt: new Date() });
    return { active: workflow.isActive, checkpoints };
  }

  async providerPollStatus(workflowId: string, userId: string) {
    const workflow = await this.findOwned(workflowId, userId);
    if (!workflow.publishedVersion) return { active: workflow.isActive, checkpoints: [] };
    const checkpoints = await this.prisma.providerPollCheckpoint.findMany({ where: { workflowId, workflowVersionId: workflow.publishedVersion.id }, select: { nodeId: true, state: true, lastErrorCode: true, updatedAt: true } });
    if (workflow.isActive) for (const node of parseStoredWorkflowGraph(workflow.publishedVersion.graph).nodes.filter((item) => item.type === "trigger.notion.page" || item.type === "trigger.google-drive.file" || item.type === "trigger.google-sheets.row")) if (!checkpoints.some((checkpoint) => checkpoint.nodeId === node.id)) checkpoints.push({ nodeId: node.id, state: "ERROR", lastErrorCode: "PROVIDER_CHECKPOINT_MISSING", updatedAt: new Date() });
    return { active: workflow.isActive, checkpoints };
  }

  async resetProviderPoll(workflowId: string, userId: string, confirmDataGap: boolean) {
    if (!confirmDataGap) throw new BadRequestException({ code: "PROVIDER_RESET_CONFIRM_REQUIRED", message: "Confirm that changes during the gap may be missed." });
    const workflow = await this.findOwned(workflowId, userId);
    if (workflow.isActive || !workflow.publishedVersion || !this.providerPoll) throw new ConflictException({ code: "PROVIDER_RESET_REQUIRES_INACTIVE", message: "Deactivate the workflow before resetting its trigger." });
    const versionId = workflow.publishedVersion.id;
    const baselines = await this.providerPoll.baselines(workflowId, versionId, workflow.workspaceId, parseStoredWorkflowGraph(workflow.publishedVersion.graph), true);
    if (!baselines.length) throw new BadRequestException({ code: "PROVIDER_TRIGGER_NOT_FOUND", message: "The published workflow has no supported trigger." });
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ publishedVersionId: string | null; isActive: boolean; archivedAt: Date | null }>>`SELECT "publishedVersionId", "isActive", "archivedAt" FROM "Workflow" WHERE id = ${workflowId} FOR UPDATE`;
      if (!locked[0] || locked[0].isActive || locked[0].archivedAt || locked[0].publishedVersionId !== versionId) throw new ConflictException({ code: "WORKFLOW_CHANGED", message: "The workflow changed. Reload and try again." });
      for (const { target, cursor, baselineAt } of baselines) {
        if (!cursor) throw new ConflictException({ code: "PROVIDER_TRIGGER_CHANGED", message: "The baseline could not be prepared." });
        const key = { workflowId_nodeId: { workflowId, nodeId: target.nodeId } };
        const existing = await tx.providerPollCheckpoint.findUnique({ where: key });
        if (existing?.leaseToken && existing.leaseExpiresAt && existing.leaseExpiresAt > new Date()) throw new ConflictException({ code: "PROVIDER_POLL_IN_PROGRESS", message: "Wait for the current check to finish." });
        const pending = await tx.$queryRaw<Array<{ pending: boolean }>>`SELECT EXISTS (SELECT 1 FROM "ProviderPollDelivery" d JOIN "Execution" e ON e.id = d."executionId" WHERE d."workflowId" = ${workflowId} AND d."nodeId" = ${target.nodeId} AND e.status = 'QUEUED' AND e."startedAt" IS NULL) AS pending`;
        if (pending[0]?.pending) throw new ConflictException({ code: "PROVIDER_PENDING_RUNS", message: "Wait for queued runs to start before resetting." });
        if (existing) await tx.providerPollCheckpoint.delete({ where: key });
        await tx.providerPollCheckpoint.create({ data: { workflowId, nodeId: target.nodeId, workflowVersionId: versionId, provider: target.provider, configHash: target.configHash, cursor, baselineAt } });
      }
      await tx.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "workflow.provider_checkpoint_reset", targetType: "workflow", targetId: workflowId, metadata: { versionId } } });
    }, { maxWait: 2000, timeout: 30_000 });
    return { success: true };
  }

  async resetCalendarTrigger(workflowId: string, userId: string, confirmDataGap: boolean) {
    if (!confirmDataGap) throw new BadRequestException({ code: "CALENDAR_RESET_CONFIRM_REQUIRED", message: "Confirm that changes during the gap may be missed." });
    const workflow = await this.findOwned(workflowId, userId);
    if (workflow.isActive || !workflow.publishedVersion || !this.calendarTriggers) throw new ConflictException({ code: "CALENDAR_RESET_REQUIRES_INACTIVE", message: "Deactivate the published workflow before resetting its Calendar trigger." });
    const versionId = workflow.publishedVersion.id;
    const baselines = await this.calendarTriggers.baselines(workflowId, versionId, workflow.workspaceId, parseStoredWorkflowGraph(workflow.publishedVersion.graph), true);
    if (!baselines.length) throw new BadRequestException({ code: "CALENDAR_TRIGGER_NOT_FOUND", message: "The published workflow has no Calendar trigger." });
    await this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ publishedVersionId: string | null; isActive: boolean; archivedAt: Date | null }>>`SELECT "publishedVersionId", "isActive", "archivedAt" FROM "Workflow" WHERE id = ${workflowId} FOR UPDATE`;
      if (!locked[0] || locked[0].isActive || locked[0].archivedAt || locked[0].publishedVersionId !== versionId) throw new ConflictException({ code: "WORKFLOW_CHANGED", message: "The workflow changed. Reload and try again." });
      for (const { target, baseline } of baselines) {
        if (!baseline) throw new ConflictException({ code: "CALENDAR_TRIGGER_CHANGED", message: "Calendar baseline could not be prepared." });
        const existing = await transaction.calendarTriggerCheckpoint.findUnique({ where: { workflowId_nodeId: { workflowId, nodeId: target.nodeId } } });
        if (existing?.leaseToken && existing.leaseExpiresAt && existing.leaseExpiresAt > new Date()) throw new ConflictException({ code: "CALENDAR_POLL_IN_PROGRESS", message: "Wait for the current Calendar check to finish before resetting." });
        await transaction.$executeRaw`UPDATE "Execution" SET status = 'CANCELLED', "completedAt" = NOW() WHERE id IN (SELECT "executionId" FROM "CalendarTriggerDelivery" WHERE "workflowId" = ${workflowId} AND "nodeId" = ${target.nodeId} AND "executionId" IS NOT NULL) AND status = 'QUEUED' AND "startedAt" IS NULL`;
        if (existing) await transaction.calendarTriggerCheckpoint.delete({ where: { workflowId_nodeId: { workflowId, nodeId: target.nodeId } } });
        await transaction.calendarTriggerCheckpoint.create({ data: { workflowId, nodeId: target.nodeId, workflowVersionId: versionId, configHash: target.configHash, syncToken: baseline.syncToken, baselineAt: baseline.baselineAt } });
        if (baseline.seen.length) await transaction.calendarTriggerSeen.createMany({ data: baseline.seen.map((item) => ({ workflowId, nodeId: target.nodeId, ...item })) });
      }
      await transaction.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "workflow.calendar_checkpoint_reset", targetType: "workflow", targetId: workflowId, metadata: { versionId } } });
    }, { maxWait: 2000, timeout: 30_000 });
    return { success: true };
  }

  async resetRssTrigger(workflowId: string, userId: string, confirmDataGap: boolean) {
    if (!confirmDataGap) throw new BadRequestException({ code: "RSS_RESET_CONFIRMATION_REQUIRED", message: "Confirm that items in the gap may be missed." });
    const workflow = await this.findOwned(workflowId, userId);
    if (workflow.isActive || !workflow.publishedVersion || !this.rssTriggers) throw new ConflictException({ code: "RSS_RESET_REQUIRES_INACTIVE", message: "Deactivate the published workflow before resetting the RSS trigger." });
    const versionId = workflow.publishedVersion.id;
    const baselines = await this.rssTriggers.freshBaselines(workflowId, versionId, parseStoredWorkflowGraph(workflow.publishedVersion.graph));
    if (!baselines.length) throw new BadRequestException({ code: "RSS_TRIGGER_NOT_FOUND", message: "The published workflow has no RSS trigger." });
    await this.prisma.$transaction(async (transaction) => {
      const workflows = await transaction.$queryRaw<Array<{ publishedVersionId: string | null; isActive: boolean; archivedAt: Date | null }>>`SELECT "publishedVersionId", "isActive", "archivedAt" FROM "Workflow" WHERE id = ${workflowId} FOR UPDATE`;
      if (!workflows[0] || workflows[0].isActive || workflows[0].archivedAt || workflows[0].publishedVersionId !== versionId) throw new ConflictException({ code: "WORKFLOW_CHANGED", message: "The workflow changed. Reload and try again." });
      let cancelledQueued = 0;
      for (const { target, baseline } of baselines) {
        const rows = await transaction.$queryRaw<Array<{ leaseToken: string | null; leaseExpiresAt: Date | null }>>`SELECT "leaseToken", "leaseExpiresAt" FROM "RssTriggerCheckpoint" WHERE "workflowId" = ${workflowId} AND "nodeId" = ${target.nodeId} FOR UPDATE`;
        if (rows[0]?.leaseToken && rows[0].leaseExpiresAt && rows[0].leaseExpiresAt > new Date()) throw new ConflictException({ code: "RSS_POLL_IN_PROGRESS", message: "Wait for the current RSS check to finish before resetting." });
        cancelledQueued += await transaction.$executeRaw`UPDATE "Execution" SET "status" = 'CANCELLED', "completedAt" = NOW() WHERE id IN (SELECT "executionId" FROM "RssTriggerDelivery" WHERE "workflowId" = ${workflowId} AND "nodeId" = ${target.nodeId} AND "executionId" IS NOT NULL) AND "status" = 'QUEUED' AND "startedAt" IS NULL`;
        await transaction.$executeRaw`DELETE FROM "RssTriggerCheckpoint" WHERE "workflowId" = ${workflowId} AND "nodeId" = ${target.nodeId}`;
        const now = new Date();
        await transaction.$executeRaw`INSERT INTO "RssTriggerCheckpoint" ("workflowId", "nodeId", "workflowVersionId", "feedUrlHash", "snapshot", "etag", "lastModified", "updatedAt") VALUES (${workflowId}, ${target.nodeId}, ${versionId}, ${baseline.feedUrlHash}, ${JSON.stringify(baseline.keys)}::jsonb, ${baseline.etag}, ${baseline.lastModified}, ${now})`;
        if (baseline.keys.length) await transaction.$executeRaw`INSERT INTO "RssTriggerDelivery" ("workflowId", "nodeId", "itemKey", "lastSeenAt") VALUES ${Prisma.join(baseline.keys.map((key) => Prisma.sql`(${workflowId}, ${target.nodeId}, ${key}, ${now})`))}`;
      }
      await transaction.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "workflow.rss_checkpoint_reset", targetType: "workflow", targetId: workflowId, metadata: { versionId, cancelledQueued } } });
    });
    return { success: true };
  }

  async resetGmailTrigger(workflowId: string, userId: string, confirmDataGap: boolean) {
    if (!confirmDataGap) throw new BadRequestException({ code: "GMAIL_RESET_CONFIRMATION_REQUIRED", message: "Confirm that messages in the gap may be missed." });
    const workflow = await this.findOwned(workflowId, userId);
    if (workflow.isActive || !workflow.publishedVersion || !this.gmailTriggers) throw new ConflictException({ code: "GMAIL_RESET_REQUIRES_INACTIVE", message: "Deactivate the published workflow before resetting the Gmail trigger." });
    const graph = parseStoredWorkflowGraph(workflow.publishedVersion.graph);
    const baselines = await this.gmailTriggers.baseline(workflow.workspaceId, graph);
    if (!baselines.length) throw new BadRequestException({ code: "GMAIL_TRIGGER_NOT_FOUND", message: "The published workflow has no Gmail trigger." });
    const versionId = workflow.publishedVersion.id;
    await this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ publishedVersionId: string | null; isActive: boolean; archivedAt: Date | null }>>`SELECT "publishedVersionId", "isActive", "archivedAt" FROM "Workflow" WHERE id = ${workflowId} FOR UPDATE`;
      if (!locked[0] || locked[0].isActive || locked[0].archivedAt || locked[0].publishedVersionId !== versionId) throw new ConflictException({ code: "WORKFLOW_CHANGED", message: "The workflow changed. Reload and try again." });
      let skipped = 0;
      let cancelledQueued = 0;
      for (const baseline of baselines) {
        const key = { workflowVersionId_nodeId: { workflowVersionId: versionId, nodeId: baseline.nodeId } };
        const existing = await transaction.gmailTriggerCheckpoint.findUnique({ where: key });
        if (!existing) throw new ConflictException({ code: "GMAIL_CHECKPOINT_NOT_FOUND", message: "The Gmail trigger has no checkpoint to reset." });
        const pending = await transaction.gmailTriggerDelivery.findMany({ where: { workflowVersionId: versionId, nodeId: baseline.nodeId, dispatchedAt: null, executionId: { not: null } }, select: { executionId: true } });
        const ids = pending.flatMap((item) => item.executionId ? [item.executionId] : []);
        if (ids.length) {
          const cancelled = await transaction.execution.updateMany({ where: { id: { in: ids }, status: ExecutionStatus.QUEUED }, data: { status: ExecutionStatus.CANCELLED, completedAt: new Date() } });
          cancelledQueued += cancelled.count;
        }
        const result = await transaction.gmailTriggerDelivery.updateMany({ where: { workflowVersionId: versionId, nodeId: baseline.nodeId, dispatchedAt: null }, data: { dispatchedAt: new Date(), skipReason: "owner_confirmed_checkpoint_reset" } });
        skipped += result.count;
        await transaction.gmailTriggerCheckpoint.update({ where: key, data: { historyId: baseline.historyId, mailboxHash: baseline.mailboxHash, pageToken: null, state: "READY", lastErrorCode: null, leaseToken: null, leaseExpiresAt: null, nextPollAt: null } });
      }
      await transaction.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "workflow.gmail_checkpoint_reset", targetType: "workflow", targetId: workflowId, metadata: { versionId, skippedPendingDeliveries: skipped, cancelledQueued } } });
    });
    return { success: true };
  }

  async listVersions(workflowId: string, userId: string) {
    await this.findOwned(workflowId, userId);
    const versions = await this.prisma.workflowVersion.findMany({ where: { workflowId }, orderBy: { version: "desc" } });
    return versions.map((version) => ({ id: version.id, version: version.version, status: version.status, createdAt: version.createdAt, publishedAt: version.publishedAt, nodeCount: nodeCount(version.graph) }));
  }

  async updateDraft(workflowId: string, userId: string, input: UpdateDraftInput) {
    const workflow = await this.findOwned(workflowId, userId);
    const graph = parseWorkflowGraph(input.graph);
    const updated = await this.prisma.$transaction(async (transaction) => {
      // Lock in the same order as publish and provider reservation.
      const locked = await transaction.$queryRaw<Array<{ draftVersionId: string | null }>>`SELECT "draftVersionId" FROM "Workflow" WHERE id = ${workflowId} FOR UPDATE`;
      if (!locked[0] || locked[0].draftVersionId !== workflow.draftVersionId) throw new ConflictException({ code: "WORKFLOW_DRAFT_CHANGED", message: "The workflow draft changed. Reload before saving." });
      await lockGraphCredentials(transaction, workflow.workspaceId, graph);
      const draft = workflow.draftVersionId
        ? await transaction.workflowVersion.update({ where: { id: workflow.draftVersionId }, data: { graph: graph as Prisma.InputJsonValue } })
        : await transaction.workflowVersion.create({
          data: { workflowId, version: (await nextVersion(transaction, workflowId)), status: WorkflowVersionStatus.DRAFT, graph: graph as Prisma.InputJsonValue },
        });
      const linked = await transaction.workflow.update({
        where: { id: workflowId },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined ? {} : { description: input.description }),
          draftVersionId: draft.id,
        },
        include: { draftVersion: true, publishedVersion: true },
      });
      await transaction.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "workflow.draft_saved", targetType: "workflow", targetId: workflowId } });
      return linked;
    });
    return this.serialize(updated);
  }

  async publish(workflowId: string, userId: string, confirmDiscardGmail = false, confirmDiscardRss = false) {
    const workflow = await this.findOwned(workflowId, userId);
    if (!workflow.draftVersion) {
      throw new NotFoundException({ code: "DRAFT_NOT_FOUND", message: "Workflow has no draft version to publish." });
    }
    const draftVersion = workflow.draftVersion;
    const updated = await this.prisma.$transaction(async (transaction) => {
      // The provider reservation uses this same lock. A published version must
      // not change while a remote registration still refers to it.
      const locked = await transaction.$queryRaw<Array<{ draftVersionId: string | null; publishedVersionId: string | null; isActive: boolean }>>`SELECT "draftVersionId", "publishedVersionId", "isActive" FROM "Workflow" WHERE id = ${workflowId} FOR UPDATE`;
      if (locked[0]?.draftVersionId !== draftVersion.id) throw new ConflictException({ code: "WORKFLOW_DRAFT_CHANGED", message: "The workflow draft changed. Reload before publishing." });
      const managed = await transaction.providerWebhookRegistration.findFirst({ where: { endpoint: { workflowId } }, select: { id: true } });
      if (managed) throw new ConflictException({ code: "PROVIDER_WEBHOOK_MANAGED", message: "Resolve the provider-managed webhook registration before publishing a new workflow version." });
      const currentDraft = await transaction.workflowVersion.findUnique({ where: { id: draftVersion.id } });
      if (!currentDraft || currentDraft.status !== WorkflowVersionStatus.DRAFT) throw new ConflictException({ code: "WORKFLOW_DRAFT_CHANGED", message: "The workflow draft changed. Reload before publishing." });
      const graph = parseWorkflowGraph(currentDraft.graph);
      validatePublishableGraph(graph);
      const previous = locked[0]?.publishedVersionId ? await transaction.workflowVersion.findUnique({ where: { id: locked[0].publishedVersionId } }) : null;
      const previousGmail = previous ? parseStoredWorkflowGraph(previous.graph).nodes.find((node) => node.type === "trigger.gmail") : undefined;
      const nextGmail = graph.nodes.find((node) => node.type === "trigger.gmail");
      const previousRss = previous ? rssTargets(workflowId, previous.id, parseStoredWorkflowGraph(previous.graph))[0] : undefined;
      const nextRss = rssTargets(workflowId, draftVersion.id, graph)[0];
      const previousCalendar = previous ? calendarTargets(workflowId, previous.id, workflow.workspaceId, parseStoredWorkflowGraph(previous.graph))[0] : undefined;
      const nextCalendar = calendarTargets(workflowId, draftVersion.id, workflow.workspaceId, graph)[0];
      const previousProvider = previous ? providerPollTargets(workflowId, previous.id, workflow.workspaceId, parseStoredWorkflowGraph(previous.graph))[0] : undefined;
      const nextProvider = providerPollTargets(workflowId, draftVersion.id, workflow.workspaceId, graph)[0];
      if (locked[0]?.isActive && (previousProvider || nextProvider)) throw new ConflictException({ code: "PROVIDER_TRIGGER_DEACTIVATE_TO_PUBLISH", message: "Deactivate the workflow before publishing a different trigger version." });
      const providerCheckpoint = previousProvider ? await transaction.providerPollCheckpoint.findUnique({ where: { workflowId_nodeId: { workflowId, nodeId: previousProvider.nodeId } } }) : null;
      if (providerCheckpoint?.leaseToken && providerCheckpoint.leaseExpiresAt && providerCheckpoint.leaseExpiresAt > new Date()) throw new ConflictException({ code: "PROVIDER_POLL_IN_PROGRESS", message: "Wait for the current check to finish before publishing." });
      const preserveProvider = Boolean(providerCheckpoint && nextProvider && previousProvider?.nodeId === nextProvider.nodeId && providerCheckpoint.configHash === nextProvider.configHash);
      if (providerCheckpoint && !preserveProvider) {
        const pending = await transaction.$queryRaw<Array<{ pending: boolean }>>`SELECT EXISTS (SELECT 1 FROM "ProviderPollDelivery" d JOIN "Execution" e ON e.id = d."executionId" WHERE d."workflowId" = ${workflowId} AND d."nodeId" = ${previousProvider!.nodeId} AND e.status = 'QUEUED' AND e."startedAt" IS NULL) AS pending`;
        if (pending[0]?.pending) throw new ConflictException({ code: "PROVIDER_PENDING_RUNS", message: "Wait for queued trigger runs to start before changing this trigger." });
      }
      if (locked[0]?.isActive && (nextGmail || previousGmail)) throw new ConflictException({ code: "GMAIL_TRIGGER_DEACTIVATE_TO_PUBLISH", message: "Deactivate the Gmail-triggered workflow before publishing a different version." });
      if (locked[0]?.isActive && (nextRss || previousRss)) throw new ConflictException({ code: "RSS_TRIGGER_DEACTIVATE_TO_PUBLISH", message: "Deactivate the RSS-triggered workflow before publishing a different version." });
      if (locked[0]?.isActive && (nextCalendar || previousCalendar)) throw new ConflictException({ code: "CALENDAR_TRIGGER_DEACTIVATE_TO_PUBLISH", message: "Deactivate the Calendar-triggered workflow before publishing a different version." });
      const calendarCheckpoint = previousCalendar ? await transaction.calendarTriggerCheckpoint.findUnique({ where: { workflowId_nodeId: { workflowId, nodeId: previousCalendar.nodeId } } }) : null;
      if (calendarCheckpoint?.leaseToken && calendarCheckpoint.leaseExpiresAt && calendarCheckpoint.leaseExpiresAt > new Date()) throw new ConflictException({ code: "CALENDAR_POLL_IN_PROGRESS", message: "Wait for the current Calendar check to finish before publishing." });
      const preserveCalendar = Boolean(calendarCheckpoint && previousCalendar && nextCalendar && previousCalendar.nodeId === nextCalendar.nodeId && calendarCheckpoint.configHash === nextCalendar.configHash);
      if (calendarCheckpoint && !preserveCalendar && previousCalendar) {
        const pending = await transaction.$queryRaw<Array<{ pending: boolean }>>`SELECT EXISTS (SELECT 1 FROM "CalendarTriggerDelivery" d JOIN "Execution" e ON e.id = d."executionId" WHERE d."workflowId" = ${workflowId} AND d."nodeId" = ${previousCalendar.nodeId} AND e.status = 'QUEUED' AND e."startedAt" IS NULL) AS pending`;
        if (pending[0]?.pending) throw new ConflictException({ code: "CALENDAR_PENDING_RUNS", message: "Wait for queued Calendar runs to start before changing this trigger." });
      }
      const rssRows = previousRss ? await transaction.$queryRaw<Array<{ feedUrlHash: string; state: string; leaseToken: string | null; leaseExpiresAt: Date | null }>>`SELECT "feedUrlHash", "state", "leaseToken", "leaseExpiresAt" FROM "RssTriggerCheckpoint" WHERE "workflowId" = ${workflowId} AND "nodeId" = ${previousRss.nodeId} FOR UPDATE` : [];
      const rssCheckpoint = rssRows[0];
      if (rssCheckpoint?.leaseToken && rssCheckpoint.leaseExpiresAt && rssCheckpoint.leaseExpiresAt > new Date()) throw new ConflictException({ code: "RSS_POLL_IN_PROGRESS", message: "Wait for the current RSS check to finish before publishing." });
      const preserveRss = Boolean(rssCheckpoint && previousRss && nextRss && previousRss.nodeId === nextRss.nodeId && rssCheckpoint.feedUrlHash === rssFeedUrlHash(nextRss.url));
      if (rssCheckpoint && !preserveRss && !confirmDiscardRss) throw new ConflictException({ code: "RSS_PUBLISH_GAP_CONFIRMATION", message: "Changing or removing this RSS trigger discards its saved progress. Review before publishing." });
      const oldCheckpoint = previous && previousGmail ? await transaction.gmailTriggerCheckpoint.findUnique({ where: { workflowVersionId_nodeId: { workflowVersionId: previous.id, nodeId: previousGmail.id } } }) : null;
      if (oldCheckpoint?.leaseToken && oldCheckpoint.leaseExpiresAt && oldCheckpoint.leaseExpiresAt > new Date()) throw new ConflictException({ code: "GMAIL_POLL_IN_PROGRESS", message: "Wait for the current Gmail check to finish before publishing." });
      const preserveGmail = Boolean(oldCheckpoint && previousGmail && nextGmail && previousGmail.id === nextGmail.id && previousGmail.config.credentialId === nextGmail.config.credentialId);
      if (oldCheckpoint && !preserveGmail && !confirmDiscardGmail) throw new ConflictException({ code: "GMAIL_PUBLISH_GAP_CONFIRMATION", message: "Changing or removing this Gmail trigger may leave messages unprocessed. Review before publishing." });
      const published = await transaction.workflowVersion.update({
        where: { id: draftVersion.id },
        data: { status: WorkflowVersionStatus.PUBLISHED, publishedAt: new Date() },
      });
      if (providerCheckpoint && previousProvider && preserveProvider) await transaction.providerPollCheckpoint.update({ where: { workflowId_nodeId: { workflowId, nodeId: previousProvider.nodeId } }, data: { workflowVersionId: published.id, leaseToken: null, leaseExpiresAt: null, nextPollAt: null } });
      else if (providerCheckpoint && previousProvider) await transaction.providerPollCheckpoint.delete({ where: { workflowId_nodeId: { workflowId, nodeId: previousProvider.nodeId } } });
      if (calendarCheckpoint && previousCalendar && preserveCalendar) await transaction.calendarTriggerCheckpoint.update({ where: { workflowId_nodeId: { workflowId, nodeId: previousCalendar.nodeId } }, data: { workflowVersionId: published.id, leaseToken: null, leaseExpiresAt: null, nextPollAt: null } });
      else if (calendarCheckpoint && previousCalendar) await transaction.calendarTriggerCheckpoint.delete({ where: { workflowId_nodeId: { workflowId, nodeId: previousCalendar.nodeId } } });
      if (rssCheckpoint && previousRss && preserveRss) {
        await transaction.$executeRaw`UPDATE "RssTriggerCheckpoint" SET "workflowVersionId" = ${published.id}, "leaseToken" = NULL, "leaseExpiresAt" = NULL, "nextPollAt" = NULL, "updatedAt" = NOW() WHERE "workflowId" = ${workflowId} AND "nodeId" = ${previousRss.nodeId}`;
      } else if (rssCheckpoint && previousRss && confirmDiscardRss) {
        // Existing running/approved executions remain intact. A queued initial
        // run is cancelled before its receipt is removed so it cannot become
        // an orphan that is no longer recoverable.
        await transaction.$executeRaw`UPDATE "Execution" SET "status" = 'CANCELLED', "completedAt" = NOW() WHERE id IN (SELECT "executionId" FROM "RssTriggerDelivery" WHERE "workflowId" = ${workflowId} AND "nodeId" = ${previousRss.nodeId} AND "executionId" IS NOT NULL) AND "status" = 'QUEUED' AND "startedAt" IS NULL`;
        await transaction.$executeRaw`DELETE FROM "RssTriggerCheckpoint" WHERE "workflowId" = ${workflowId} AND "nodeId" = ${previousRss.nodeId}`;
      }
      if (oldCheckpoint && previous && previousGmail && nextGmail && preserveGmail) {
        await transaction.gmailTriggerCheckpoint.create({ data: { workflowVersionId: published.id, nodeId: nextGmail.id, historyId: oldCheckpoint.historyId, mailboxHash: oldCheckpoint.mailboxHash, pageToken: oldCheckpoint.pageToken, state: oldCheckpoint.state, lastErrorCode: oldCheckpoint.lastErrorCode, nextPollAt: oldCheckpoint.nextPollAt } });
        await transaction.$executeRaw`INSERT INTO "GmailTriggerDelivery" ("workflowVersionId", "nodeId", "messageId", "executionId", "dispatchedAt", "skipReason", "createdAt") SELECT ${published.id}, ${nextGmail.id}, "messageId", "executionId", "dispatchedAt", "skipReason", "createdAt" FROM "GmailTriggerDelivery" WHERE "workflowVersionId" = ${previous.id} AND "nodeId" = ${previousGmail.id}`;
      } else if (oldCheckpoint && previous && previousGmail && confirmDiscardGmail) {
        const pending = await transaction.gmailTriggerDelivery.findMany({ where: { workflowVersionId: previous.id, nodeId: previousGmail.id, dispatchedAt: null, executionId: { not: null } }, select: { executionId: true } });
        const ids = pending.flatMap((item) => item.executionId ? [item.executionId] : []);
        if (ids.length) await transaction.execution.updateMany({ where: { id: { in: ids }, status: ExecutionStatus.QUEUED }, data: { status: ExecutionStatus.CANCELLED, completedAt: new Date() } });
        await transaction.gmailTriggerDelivery.updateMany({ where: { workflowVersionId: previous.id, nodeId: previousGmail.id, dispatchedAt: null }, data: { dispatchedAt: new Date(), skipReason: "owner_confirmed_trigger_change" } });
      }
      const nextDraft = await transaction.workflowVersion.create({
        data: { workflowId, version: await nextVersion(transaction, workflowId), status: WorkflowVersionStatus.DRAFT, graph: graph as Prisma.InputJsonValue },
      });
      const linked = await transaction.workflow.update({
        where: { id: workflowId },
        data: { publishedVersionId: published.id, draftVersionId: nextDraft.id },
        include: { draftVersion: true, publishedVersion: true },
      });
      await transaction.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "workflow.published", targetType: "workflow", targetId: workflowId, metadata: { version: published.version, ...(oldCheckpoint && !preserveGmail ? { gmailGapAcknowledged: true } : {}), ...(rssCheckpoint && !preserveRss ? { rssGapAcknowledged: true } : {}) } } });
      return linked;
    });
    return this.serialize(updated);
  }

  async activate(workflowId: string, userId: string) {
    const workflow = await this.findOwned(workflowId, userId);
    if (!workflow.publishedVersion) throw new NotFoundException({ code: "PUBLISHED_VERSION_REQUIRED", message: "Publish this workflow before activating it." });
    if (workflow.isActive) return this.serialize(workflow);
    const graph = parseStoredWorkflowGraph(workflow.publishedVersion.graph);
    assertExecutableGraph(graph);
    const gmailNodes = graph.nodes.filter((node) => node.type === "trigger.gmail");
    const rssNodes = graph.nodes.filter((node) => ["trigger.rss.new-item", "trigger.steam.game-news"].includes(node.type));
    const calendarNodes = graph.nodes.filter((node) => node.type === "trigger.google-calendar.event");
    const jiraNodes = graph.nodes.filter((node) => node.type === "trigger.jira.issue");
    const providerNodes = graph.nodes.filter((node) => node.type === "trigger.notion.page" || node.type === "trigger.google-drive.file" || node.type === "trigger.google-sheets.row");
    if (gmailNodes.length && !this.gmailTriggers) throw new BadRequestException({ code: "GMAIL_TRIGGER_UNAVAILABLE", message: "Gmail trigger is unavailable." });
    if (rssNodes.length && !this.rssTriggers) throw new BadRequestException({ code: "RSS_TRIGGER_UNAVAILABLE", message: "RSS trigger is unavailable." });
    if (calendarNodes.length && !this.calendarTriggers) throw new BadRequestException({ code: "CALENDAR_TRIGGER_UNAVAILABLE", message: "Calendar trigger is unavailable." });
    if (providerNodes.length && !this.providerPoll) throw new BadRequestException({ code: "PROVIDER_TRIGGER_UNAVAILABLE", message: "This trigger is unavailable." });
    const baselines = gmailNodes.length ? await this.gmailTriggers!.baseline(workflow.workspaceId, graph) : [];
    const rssBaselines = rssNodes.length ? await this.rssTriggers!.baselines(workflowId, workflow.publishedVersion.id, graph) : [];
    const calendarBaselines = calendarNodes.length ? await this.calendarTriggers!.baselines(workflowId, workflow.publishedVersion.id, workflow.workspaceId, graph) : [];
    const providerBaselines = providerNodes.length ? await this.providerPoll!.baselines(workflowId, workflow.publishedVersion.id, workflow.workspaceId, graph) : [];
    const activatedAt = new Date();
    const updated = await this.prisma.$transaction(async (transaction) => {
      if (gmailNodes.length || rssNodes.length || calendarNodes.length || jiraNodes.length || providerNodes.length) {
        const locked = await transaction.$queryRaw<Array<{ publishedVersionId: string | null; isActive: boolean; archivedAt: Date | null }>>`SELECT "publishedVersionId", "isActive", "archivedAt" FROM "Workflow" WHERE id = ${workflowId} FOR UPDATE`;
        if (!locked[0] || locked[0].isActive || locked[0].archivedAt || locked[0].publishedVersionId !== workflow.publishedVersion!.id) throw new ConflictException({ code: "WORKFLOW_CHANGED", message: "The workflow changed while activating. Reload and try again." });
        if (jiraNodes.length) {
          const registrations = await transaction.$queryRaw<Array<{ state: string; workflowVersionId: string; isActive: boolean }>>`SELECT r."state", r."workflowVersionId", e."isActive" FROM "ProviderWebhookRegistration" r JOIN "WebhookEndpoint" e ON e.id = r."endpointId" WHERE e."workflowId" = ${workflowId} AND r.provider = 'JIRA' FOR UPDATE OF r, e`;
          if (registrations.length !== 1 || registrations[0]?.state !== "ACTIVE" || !registrations[0]?.isActive || registrations[0]?.workflowVersionId !== workflow.publishedVersion!.id) throw new ConflictException({ code: "JIRA_WEBHOOK_REQUIRED", message: "Connect the Jira webhook before activating this workflow." });
        }
        for (const baseline of baselines) {
          const key = { workflowVersionId_nodeId: { workflowVersionId: workflow.publishedVersion!.id, nodeId: baseline.nodeId } };
          const existing = await transaction.gmailTriggerCheckpoint.findUnique({ where: key });
          if (existing?.state === "ERROR") throw new ConflictException({ code: "GMAIL_TRIGGER_RECOVERY_REQUIRED", message: "Review the Gmail trigger error and explicitly reset its checkpoint before reactivating." });
          if (existing && existing.mailboxHash !== baseline.mailboxHash) throw new ConflictException({ code: "GMAIL_MAILBOX_CHANGED", message: "This connection belongs to a different Gmail mailbox. Review and explicitly reset the trigger before reactivating." });
          if (existing) await transaction.gmailTriggerCheckpoint.update({ where: key, data: { leaseToken: null, leaseExpiresAt: null, nextPollAt: null } });
          else await transaction.gmailTriggerCheckpoint.create({ data: { workflowVersionId: workflow.publishedVersion!.id, ...baseline } });
        }
        for (const { target, baseline } of rssBaselines) {
          const rows = await transaction.$queryRaw<Array<{ feedUrlHash: string; workflowVersionId: string; state: string; lastErrorCode: string | null; leaseToken: string | null; leaseExpiresAt: Date | null }>>`SELECT "feedUrlHash", "workflowVersionId", "state", "lastErrorCode", "leaseToken", "leaseExpiresAt" FROM "RssTriggerCheckpoint" WHERE "workflowId" = ${workflowId} AND "nodeId" = ${target.nodeId} FOR UPDATE`;
          const existing = rows[0];
          if (existing && (!canResumeRssCheckpoint(existing.state, existing.lastErrorCode) || existing.workflowVersionId !== target.versionId || existing.feedUrlHash !== rssFeedUrlHash(target.url))) throw new ConflictException({ code: "RSS_TRIGGER_RECOVERY_REQUIRED", message: "Review the RSS trigger before reactivating it." });
          if (existing?.leaseToken && existing.leaseExpiresAt && existing.leaseExpiresAt > activatedAt) throw new ConflictException({ code: "RSS_POLL_IN_PROGRESS", message: "Wait for the current RSS check to finish before activating." });
          if (existing?.state === "ERROR") await transaction.$executeRaw`UPDATE "RssTriggerCheckpoint" SET "state" = 'READY', "lastErrorCode" = NULL, "leaseToken" = NULL, "leaseExpiresAt" = NULL, "nextPollAt" = NULL, "updatedAt" = ${activatedAt} WHERE "workflowId" = ${workflowId} AND "nodeId" = ${target.nodeId}`;
          else if (existing) await transaction.$executeRaw`UPDATE "RssTriggerCheckpoint" SET "leaseToken" = NULL, "leaseExpiresAt" = NULL, "nextPollAt" = NULL, "updatedAt" = ${activatedAt} WHERE "workflowId" = ${workflowId} AND "nodeId" = ${target.nodeId}`;
          else {
            if (!baseline) throw new ConflictException({ code: "RSS_CHECKPOINT_CHANGED", message: "The RSS trigger changed. Reload and try again." });
            await transaction.$executeRaw`INSERT INTO "RssTriggerCheckpoint" ("workflowId", "nodeId", "workflowVersionId", "feedUrlHash", "snapshot", "etag", "lastModified", "updatedAt") VALUES (${workflowId}, ${target.nodeId}, ${target.versionId}, ${baseline.feedUrlHash}, ${JSON.stringify(baseline.keys)}::jsonb, ${baseline.etag}, ${baseline.lastModified}, ${activatedAt})`;
            if (baseline.keys.length) await transaction.$executeRaw`INSERT INTO "RssTriggerDelivery" ("workflowId", "nodeId", "itemKey", "lastSeenAt") VALUES ${Prisma.join(baseline.keys.map((key) => Prisma.sql`(${workflowId}, ${target.nodeId}, ${key}, ${activatedAt})`))}`;
          }
        }
        for (const { target, baseline } of calendarBaselines) {
          const key = { workflowId_nodeId: { workflowId, nodeId: target.nodeId } };
          const existing = await transaction.calendarTriggerCheckpoint.findUnique({ where: key });
          if (existing && (existing.state !== "READY" || existing.workflowVersionId !== target.versionId || existing.configHash !== target.configHash)) throw new ConflictException({ code: "CALENDAR_TRIGGER_RECOVERY_REQUIRED", message: "Review the Calendar trigger before reactivating it." });
          if (existing?.leaseToken && existing.leaseExpiresAt && existing.leaseExpiresAt > activatedAt) throw new ConflictException({ code: "CALENDAR_POLL_IN_PROGRESS", message: "Wait for the current Calendar check to finish before activating." });
          if (existing) await transaction.calendarTriggerCheckpoint.update({ where: key, data: { leaseToken: null, leaseExpiresAt: null, nextPollAt: null } });
          else {
            if (!baseline) throw new ConflictException({ code: "CALENDAR_TRIGGER_CHANGED", message: "The Calendar trigger changed. Reload and try again." });
            await transaction.calendarTriggerCheckpoint.create({ data: { workflowId, nodeId: target.nodeId, workflowVersionId: target.versionId, configHash: target.configHash, syncToken: baseline.syncToken, baselineAt: baseline.baselineAt } });
            if (baseline.seen.length) await transaction.calendarTriggerSeen.createMany({ data: baseline.seen.map((item) => ({ workflowId, nodeId: target.nodeId, ...item })) });
          }
        }
        for (const { target, cursor, baselineAt } of providerBaselines) {
          const key = { workflowId_nodeId: { workflowId, nodeId: target.nodeId } };
          const existing = await transaction.providerPollCheckpoint.findUnique({ where: key });
          if (existing && (existing.state !== "READY" || existing.workflowVersionId !== target.versionId || existing.configHash !== target.configHash)) throw new ConflictException({ code: "PROVIDER_POLL_RECOVERY_REQUIRED", message: "Review the trigger before reactivating it." });
          if (existing?.leaseToken && existing.leaseExpiresAt && existing.leaseExpiresAt > activatedAt) throw new ConflictException({ code: "PROVIDER_POLL_IN_PROGRESS", message: "Wait for the current check to finish before activating." });
          if (existing) await transaction.providerPollCheckpoint.update({ where: key, data: { leaseToken: null, leaseExpiresAt: null, nextPollAt: null } });
          else {
            if (!cursor) throw new ConflictException({ code: "PROVIDER_TRIGGER_CHANGED", message: "The trigger changed. Reload and try again." });
            await transaction.providerPollCheckpoint.create({ data: { workflowId, nodeId: target.nodeId, workflowVersionId: target.versionId, provider: target.provider, configHash: target.configHash, cursor, baselineAt } });
          }
        }
      }
      const activated = await transaction.workflow.update({
        where: { id: workflowId },
        data: { isActive: true, activatedAt },
        include: { draftVersion: true, publishedVersion: true },
      });
      await transaction.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "workflow.activated", targetType: "workflow", targetId: workflowId, metadata: { version: workflow.publishedVersion?.version } } });
      return activated;
    }, { maxWait: 2000, timeout: 30_000 });
    return this.serialize(updated);
  }

  async deactivate(workflowId: string, userId: string) {
    const workflow = await this.findOwned(workflowId, userId);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const deactivated = await transaction.workflow.update({
        where: { id: workflowId },
        data: { isActive: false, activatedAt: null },
        include: { draftVersion: true, publishedVersion: true },
      });
      await transaction.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "workflow.deactivated", targetType: "workflow", targetId: workflowId } });
      return deactivated;
    });
    return this.serialize(updated);
  }

  async clone(workflowId: string, userId: string) {
    const source = await this.findOwned(workflowId, userId);
    const sourceGraph = source.draftVersion?.graph ?? source.publishedVersion?.graph;
    if (!sourceGraph) throw new NotFoundException({ code: "WORKFLOW_VERSION_NOT_FOUND", message: "Workflow has no version to clone." });
    return this.create(source.workspaceId, userId, { name: `${source.name} copy`, description: source.description ?? undefined, graph: sourceGraph });
  }

  async rename(workflowId: string, userId: string, name: string) {
    const workflow = await this.findOwned(workflowId, userId);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const renamed = await transaction.workflow.update({
        where: { id: workflowId },
        data: { name },
        include: { draftVersion: true, publishedVersion: true },
      });
      await transaction.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "workflow.renamed", targetType: "workflow", targetId: workflowId } });
      return renamed;
    });
    return this.serialize(updated);
  }

  async archive(workflowId: string, userId: string) {
    const workflow = await this.findOwned(workflowId, userId);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const archived = await transaction.workflow.update({
        where: { id: workflowId },
        data: { archivedAt: new Date() },
        include: { draftVersion: true, publishedVersion: true },
      });
      await transaction.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "workflow.archived", targetType: "workflow", targetId: workflowId } });
      return archived;
    });
    return this.serialize(updated);
  }

  async restore(workflowId: string, userId: string) {
    const workflow = await this.findOwned(workflowId, userId);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.workflow.updateMany({
        where: { id: workflowId, archivedAt: { not: null } },
        data: { archivedAt: null, isActive: false, activatedAt: null },
      });
      if (result.count !== 1) throw new ConflictException({ code: "WORKFLOW_NOT_ARCHIVED", message: "This workflow is not archived. Refresh the list and try again." });
      const restored = await transaction.workflow.findUniqueOrThrow({
        where: { id: workflowId },
        include: { draftVersion: true, publishedVersion: true },
      });
      await transaction.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "workflow.restored", targetType: "workflow", targetId: workflowId } });
      return restored;
    });
    return this.serialize(updated);
  }

  async delete(workflowId: string, userId: string) {
    const workflow = await this.findOwned(workflowId, userId);
    const executionCount = await this.prisma.execution.count({ where: { workflowVersion: { workflowId } } });
    if (executionCount > 0) {
      throw new BadRequestException({
        code: "WORKFLOW_HAS_EXECUTION_HISTORY",
        message: "This workflow has execution history and cannot be permanently deleted. Archive it instead.",
      });
    }
    await this.prisma.$transaction(async (transaction) => {
      await transaction.workflow.delete({ where: { id: workflowId } });
      await transaction.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "workflow.deleted", targetType: "workflow", targetId: workflowId } });
    });
    return { success: true, id: workflowId };
  }

  private async findOwned(workflowId: string, userId: string) {
    const workflow = await this.prisma.workflow.findFirst({
      where: { id: workflowId, workspace: { members: { some: { userId, role: "OWNER" } } } },
      include: { draftVersion: true, publishedVersion: true },
    });
    if (!workflow) throw new NotFoundException({ code: "WORKFLOW_NOT_FOUND", message: "Workflow was not found." });
    return workflow;
  }

  private serialize(workflow: { id: string; workspaceId: string; name: string; description: string | null; archivedAt: Date | null; isActive: boolean; activatedAt: Date | null; draftVersion: { id: string; version: number; status: WorkflowVersionStatus; graph: Prisma.JsonValue } | null; publishedVersion: { id: string; version: number; status: WorkflowVersionStatus; graph: Prisma.JsonValue } | null; createdAt: Date; updatedAt: Date }) {
    return {
      id: workflow.id,
      workspaceId: workflow.workspaceId,
      name: workflow.name,
      description: workflow.description,
      archivedAt: workflow.archivedAt,
      isActive: workflow.isActive,
      activatedAt: workflow.activatedAt,
      draft: workflow.draftVersion ? { id: workflow.draftVersion.id, version: workflow.draftVersion.version, graph: workflow.draftVersion.graph } : null,
      published: workflow.publishedVersion ? { id: workflow.publishedVersion.id, version: workflow.publishedVersion.version, graph: workflow.publishedVersion.graph } : null,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    };
  }
}

async function nextVersion(transaction: Prisma.TransactionClient, workflowId: string) {
  const latest = await transaction.workflowVersion.aggregate({ where: { workflowId }, _max: { version: true } });
  return (latest._max.version ?? 0) + 1;
}

function nodeCount(graph: Prisma.JsonValue) {
  if (!graph || typeof graph !== "object" || Array.isArray(graph)) return 0;
  const nodes = (graph as Record<string, unknown>).nodes;
  return Array.isArray(nodes) ? nodes.length : 0;
}
