import type { WorkflowGraph } from "@workflow/contracts";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { ExecutionStatus, Prisma, WorkflowVersionStatus } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { WorkspaceService } from "../workspaces/workspace.service";
import { parseWorkflowGraph, validatePublishableGraph } from "./workflow-graph";
import { systemWorkflowTemplates } from "./system-templates";
import { GmailTriggerService } from "../scheduler/gmail-trigger.service";

type CreateWorkflowInput = { name: string; description?: string; graph?: unknown };
type UpdateDraftInput = { name?: string; description?: string | null; graph: unknown };

const defaultGraph: WorkflowGraph = {
  nodes: [{ id: "manual", type: "trigger.manual", position: { x: 120, y: 180 }, config: {} }],
  edges: [],
};

@Injectable()
export class WorkflowService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(WorkspaceService) private readonly workspaces: WorkspaceService, @Optional() @Inject(GmailTriggerService) private readonly gmailTriggers?: GmailTriggerService) {}

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

  async gmailTriggerStatus(workflowId: string, userId: string) {
    const workflow = await this.findOwned(workflowId, userId);
    if (!workflow.publishedVersion) return { active: false, checkpoints: [] };
    const checkpoints = await this.prisma.gmailTriggerCheckpoint.findMany({ where: { workflowVersionId: workflow.publishedVersion.id }, select: { nodeId: true, state: true, lastErrorCode: true, updatedAt: true } });
    if (workflow.isActive) for (const node of parseWorkflowGraph(workflow.publishedVersion.graph).nodes.filter((item) => item.type === "trigger.gmail")) {
      if (!checkpoints.some((checkpoint) => checkpoint.nodeId === node.id)) checkpoints.push({ nodeId: node.id, state: "ERROR", lastErrorCode: "GMAIL_CHECKPOINT_MISSING", updatedAt: new Date() });
    }
    return { active: workflow.isActive, checkpoints };
  }

  async resetGmailTrigger(workflowId: string, userId: string, confirmDataGap: boolean) {
    if (!confirmDataGap) throw new BadRequestException({ code: "GMAIL_RESET_CONFIRMATION_REQUIRED", message: "Confirm that messages in the gap may be missed." });
    const workflow = await this.findOwned(workflowId, userId);
    if (workflow.isActive || !workflow.publishedVersion || !this.gmailTriggers) throw new ConflictException({ code: "GMAIL_RESET_REQUIRES_INACTIVE", message: "Deactivate the published workflow before resetting the Gmail trigger." });
    const graph = parseWorkflowGraph(workflow.publishedVersion.graph);
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

  async publish(workflowId: string, userId: string, confirmDiscardGmail = false) {
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
      const previousGmail = previous ? parseWorkflowGraph(previous.graph).nodes.find((node) => node.type === "trigger.gmail") : undefined;
      const nextGmail = graph.nodes.find((node) => node.type === "trigger.gmail");
      if (locked[0]?.isActive && (nextGmail || previousGmail)) throw new ConflictException({ code: "GMAIL_TRIGGER_DEACTIVATE_TO_PUBLISH", message: "Deactivate the Gmail-triggered workflow before publishing a different version." });
      const oldCheckpoint = previous && previousGmail ? await transaction.gmailTriggerCheckpoint.findUnique({ where: { workflowVersionId_nodeId: { workflowVersionId: previous.id, nodeId: previousGmail.id } } }) : null;
      if (oldCheckpoint?.leaseToken && oldCheckpoint.leaseExpiresAt && oldCheckpoint.leaseExpiresAt > new Date()) throw new ConflictException({ code: "GMAIL_POLL_IN_PROGRESS", message: "Wait for the current Gmail check to finish before publishing." });
      const preserveGmail = Boolean(oldCheckpoint && previousGmail && nextGmail && previousGmail.id === nextGmail.id && previousGmail.config.credentialId === nextGmail.config.credentialId);
      if (oldCheckpoint && !preserveGmail && !confirmDiscardGmail) throw new ConflictException({ code: "GMAIL_PUBLISH_GAP_CONFIRMATION", message: "Changing or removing this Gmail trigger may leave messages unprocessed. Review before publishing." });
      const published = await transaction.workflowVersion.update({
        where: { id: draftVersion.id },
        data: { status: WorkflowVersionStatus.PUBLISHED, publishedAt: new Date() },
      });
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
      await transaction.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "workflow.published", targetType: "workflow", targetId: workflowId, metadata: { version: published.version, ...(oldCheckpoint && !preserveGmail ? { gmailGapAcknowledged: true } : {}) } } });
      return linked;
    });
    return this.serialize(updated);
  }

  async activate(workflowId: string, userId: string) {
    const workflow = await this.findOwned(workflowId, userId);
    if (!workflow.publishedVersion) throw new NotFoundException({ code: "PUBLISHED_VERSION_REQUIRED", message: "Publish this workflow before activating it." });
    if (workflow.isActive) return this.serialize(workflow);
    const graph = parseWorkflowGraph(workflow.publishedVersion.graph);
    const gmailNodes = graph.nodes.filter((node) => node.type === "trigger.gmail");
    if (gmailNodes.length && !this.gmailTriggers) throw new BadRequestException({ code: "GMAIL_TRIGGER_UNAVAILABLE", message: "Gmail trigger is unavailable." });
    const baselines = gmailNodes.length ? await this.gmailTriggers!.baseline(workflow.workspaceId, graph) : [];
    const activatedAt = new Date();
    const updated = await this.prisma.$transaction(async (transaction) => {
      if (gmailNodes.length) {
        const locked = await transaction.$queryRaw<Array<{ publishedVersionId: string | null; isActive: boolean; archivedAt: Date | null }>>`SELECT "publishedVersionId", "isActive", "archivedAt" FROM "Workflow" WHERE id = ${workflowId} FOR UPDATE`;
        if (!locked[0] || locked[0].isActive || locked[0].archivedAt || locked[0].publishedVersionId !== workflow.publishedVersion!.id) throw new ConflictException({ code: "WORKFLOW_CHANGED", message: "The workflow changed while activating. Reload and try again." });
        for (const baseline of baselines) {
          const key = { workflowVersionId_nodeId: { workflowVersionId: workflow.publishedVersion!.id, nodeId: baseline.nodeId } };
          const existing = await transaction.gmailTriggerCheckpoint.findUnique({ where: key });
          if (existing?.state === "ERROR") throw new ConflictException({ code: "GMAIL_TRIGGER_RECOVERY_REQUIRED", message: "Review the Gmail trigger error and explicitly reset its checkpoint before reactivating." });
          if (existing && existing.mailboxHash !== baseline.mailboxHash) throw new ConflictException({ code: "GMAIL_MAILBOX_CHANGED", message: "This connection belongs to a different Gmail mailbox. Review and explicitly reset the trigger before reactivating." });
          if (existing) await transaction.gmailTriggerCheckpoint.update({ where: key, data: { leaseToken: null, leaseExpiresAt: null, nextPollAt: null } });
          else await transaction.gmailTriggerCheckpoint.create({ data: { workflowVersionId: workflow.publishedVersion!.id, ...baseline } });
        }
      }
      const activated = await transaction.workflow.update({
        where: { id: workflowId },
        data: { isActive: true, activatedAt },
        include: { draftVersion: true, publishedVersion: true },
      });
      await transaction.auditLog.create({ data: { workspaceId: workflow.workspaceId, actorId: userId, action: "workflow.activated", targetType: "workflow", targetId: workflowId, metadata: { version: workflow.publishedVersion?.version } } });
      return activated;
    });
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
