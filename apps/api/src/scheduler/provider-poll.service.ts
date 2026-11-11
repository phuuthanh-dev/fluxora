import { BadRequestException, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { CredentialProvider, Prisma, WorkflowVersionStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { WorkflowGraph } from "@workflow/contracts";
import { CredentialService } from "../credentials/credential.service";
import { PrismaService } from "../database/prisma.service";
import { ExecutionQueueService } from "../execution/execution-queue.service";
import { liveCredentialRequirements } from "../execution/live-readiness";
import { NodeFailure } from "../execution/node-failure";
import { redactValue } from "../execution/redaction";
import { BackgroundWork } from "../platform/background-work";
import { parseStoredWorkflowGraph } from "../workflows/workflow-graph";
import { notionChangedPages } from "./notion-trigger-protocol";
import { driveChanges, driveStartCursor } from "./drive-trigger-protocol";
import { readSheetSnapshot, sheetCheckpoint, sheetChanges } from "./sheets-trigger-protocol";
import { pollHash, providerPollTargets, type ProviderPollTarget } from "./provider-poll-target";

const leaseMs = 5 * 60_000;
const maxReceipts = 10_000;
type Change = { key: string; item: Record<string, unknown>; event: "created" | "updated" };
type Batch = { cursor: string; changes: Change[]; hasMore?: boolean };

@Injectable()
export class ProviderPollService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProviderPollService.name);
  private readonly background = new BackgroundWork();
  private timer: NodeJS.Timeout | null = null;
  private scanning = false;
  protected readonly notionChanges = notionChangedPages;
  protected readonly driveCursor = driveStartCursor;
  protected readonly drivePage = driveChanges;
  protected readonly sheetsSnapshot = readSheetSnapshot;
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(CredentialService) private readonly credentials: CredentialService, @Inject(ExecutionQueueService) private readonly queue: ExecutionQueueService) {}

  onModuleInit() {
    if (process.env.PROCESS_ROLE === "worker" || process.env.SCHEDULER_ENABLED === "false") return;
    const scan = () => this.background.start(() => this.tick(), () => this.logger.error("Provider polling scheduler failed."));
    scan(); this.timer = setInterval(scan, 60_000);
  }
  async onModuleDestroy() { if (this.timer) clearInterval(this.timer); this.timer = null; await this.background.drain(); }

  async baselines(workflowId: string, versionId: string, workspaceId: string, graph: WorkflowGraph, reset = false) {
    const result: Array<{ target: ProviderPollTarget; cursor: string | null; baselineAt: Date }> = [];
    for (const target of providerPollTargets(workflowId, versionId, workspaceId, graph)) {
      const existing = await this.prisma.providerPollCheckpoint.findUnique({ where: { workflowId_nodeId: { workflowId, nodeId: target.nodeId } } });
      if (existing && !reset) {
        if (existing.configHash !== target.configHash || existing.state !== "READY" || existing.workflowVersionId !== versionId) throw new BadRequestException({ code: "PROVIDER_POLL_RECOVERY_REQUIRED", message: "Review the trigger before reactivating it." });
        result.push({ target, cursor: null, baselineAt: existing.baselineAt }); continue;
      }
      const baselineAt = new Date();
      if (target.provider === "google-sheets") {
        const credential = await this.credentials.readGoogleForExecution(target.credentialId, workspaceId);
        const snapshot = await this.sheetsSnapshot(typeof credential.accessToken === "string" ? credential.accessToken : "", target.resourceId, target.sheetName!, target.keyColumn!);
        result.push({ target, cursor: JSON.stringify(sheetCheckpoint(snapshot)), baselineAt });
        continue;
      }
      if (target.provider === "google-drive") {
        const credential = await this.credentials.readGoogleForExecution(target.credentialId, workspaceId);
        result.push({ target, cursor: await this.driveCursor(typeof credential.accessToken === "string" ? credential.accessToken : ""), baselineAt });
        continue;
      }
      await this.credentials.runNotionOperation(target.credentialId, workspaceId, async () => {
        const credential = await this.credentials.readForExecution(target.credentialId, workspaceId, CredentialProvider.NOTION);
        await this.notionChanges(typeof credential.token === "string" ? credential.token : "", target.resourceId, baselineAt.toISOString());
      });
      result.push({ target, cursor: baselineAt.toISOString(), baselineAt });
    }
    return result;
  }

  private async readDrive(target: ProviderPollTarget, cursor: string, baselineAt: Date): Promise<Batch> {
    const credential = await this.credentials.readGoogleForExecution(target.credentialId, target.workspaceId);
    const page = await this.drivePage(typeof credential.accessToken === "string" ? credential.accessToken : "", cursor);
    const changes: Change[] = [];
    for (const entry of page.changes) {
      if (entry.removed || !entry.file || typeof entry.file !== "object" || Array.isArray(entry.file)) continue;
      const file = entry.file as Record<string, unknown>;
      if (file.trashed) continue;
      if (typeof file.id !== "string" || typeof file.createdTime !== "string" || typeof file.modifiedTime !== "string" || typeof file.version !== "string") throw new NodeFailure("INVALID_RESPONSE", "Google Drive returned a file without change metadata.", false);
      const created = Date.parse(file.createdTime), modified = Date.parse(file.modifiedTime);
      if (!Number.isFinite(created) || !Number.isFinite(modified)) throw new NodeFailure("INVALID_RESPONSE", "Google Drive returned an invalid file timestamp.", false);
      const matches = target.resourceType === "file" ? file.id === target.resourceId : Array.isArray(file.parents) && file.parents.includes(target.resourceId);
      if (!matches) continue;
      if (target.event === "created" && created >= baselineAt.getTime()) changes.push({ key: pollHash(`created\0${file.id}`), item: file, event: "created" });
      if (target.event === "updated" && (created < baselineAt.getTime() || modified > created)) changes.push({ key: pollHash(`updated\0${file.id}\0${file.version}`), item: file, event: "updated" });
    }
    return { cursor: page.cursor, changes, hasMore: page.hasMore };
  }

  async tick() {
    if (this.scanning) return; this.scanning = true;
    try {
      await this.recoverQueued();
      const versions = await this.prisma.workflowVersion.findMany({ where: { status: WorkflowVersionStatus.PUBLISHED, publishedFor: { is: { isActive: true, archivedAt: null } } }, include: { workflow: true } });
      for (const version of versions) {
        try { for (const target of providerPollTargets(version.workflowId, version.id, version.workflow.workspaceId, parseStoredWorkflowGraph(version.graph))) await this.poll(target); }
        catch { this.logger.warn(`Provider poll scan failed for workflow ${version.workflowId}.`); }
      }
    } catch { this.logger.warn("Provider polling scan could not complete."); }
    finally { this.scanning = false; }
  }

  private async recoverQueued() {
    const cutoff = new Date(Date.now() - 2 * 60_000);
    const queued = await this.prisma.$queryRaw<Array<{ id: string; nodeId: string }>>`SELECT e.id, d."nodeId" FROM "Execution" e JOIN "ProviderPollDelivery" d ON d."executionId" = e.id WHERE e.status = 'QUEUED' AND e.mode = 'LIVE' AND e."startedAt" IS NULL AND e."idempotencyKey" LIKE 'provider-poll:%' AND e."createdAt" < ${cutoff} ORDER BY e."createdAt" ASC LIMIT 100`;
    for (const item of queued) try { await this.queue.ensureDispatched({ executionId: item.id, mode: "live", startNodeIds: [item.nodeId], initialOnly: true }); } catch { this.logger.warn(`Could not restore provider poll execution ${item.id}.`); }
  }

  private async readNotion(target: ProviderPollTarget, cursor: string, baselineAt: Date): Promise<Batch> {
    const after = new Date(Date.parse(cursor) - 1_000);
    if (!Number.isFinite(after.getTime())) throw new NodeFailure("PROVIDER_POLL_CURSOR_INVALID", "The Notion checkpoint is invalid.", false);
    return this.credentials.runNotionOperation(target.credentialId, target.workspaceId, async () => {
      const credential = await this.credentials.readForExecution(target.credentialId, target.workspaceId, CredentialProvider.NOTION);
      const pages = await this.notionChanges(typeof credential.token === "string" ? credential.token : "", target.resourceId, after.toISOString());
      let latest = Date.parse(cursor);
      const changes: Change[] = [];
      for (const page of pages) {
        const edited = Date.parse(page.editedTime), created = Date.parse(page.createdTime);
        latest = Math.max(latest, edited);
        if (edited < baselineAt.getTime()) continue;
        if (target.event === "created") {
          if (created >= baselineAt.getTime()) changes.push({ key: pollHash(`created\0${page.id}`), item: page.item, event: "created" });
        } else if (edited > created) changes.push({ key: pollHash(`updated\0${page.id}\0${page.editedTime}`), item: page.item, event: "updated" });
      }
      return { cursor: new Date(latest).toISOString(), changes };
    });
  }

  private async readSheets(target: ProviderPollTarget, cursor: string): Promise<Batch> {
    const credential = await this.credentials.readGoogleForExecution(target.credentialId, target.workspaceId);
    const snapshot = await this.sheetsSnapshot(typeof credential.accessToken === "string" ? credential.accessToken : "", target.resourceId, target.sheetName!, target.keyColumn!);
    return sheetChanges(cursor, snapshot);
  }

  async poll(target: ProviderPollTarget) {
    const leaseToken = randomUUID(), now = new Date();
    const claim = await this.prisma.providerPollCheckpoint.updateMany({ where: { workflowId: target.workflowId, nodeId: target.nodeId, workflowVersionId: target.versionId, configHash: target.configHash, state: "READY", workflow: { isActive: true, archivedAt: null, publishedVersionId: target.versionId }, AND: [{ OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] }, { OR: [{ nextPollAt: null }, { nextPollAt: { lte: now } }] }] }, data: { leaseToken, leaseExpiresAt: new Date(now.getTime() + leaseMs) } });
    if (!claim.count) return;
    try {
      const checkpoint = await this.prisma.providerPollCheckpoint.findUniqueOrThrow({ where: { workflowId_nodeId: { workflowId: target.workflowId, nodeId: target.nodeId } } });
      const batch = target.provider === "notion" ? await this.readNotion(target, checkpoint.cursor, checkpoint.baselineAt) : target.provider === "google-sheets" ? await this.readSheets(target, checkpoint.cursor) : await this.readDrive(target, checkpoint.cursor, checkpoint.baselineAt);
      const ids = await this.commitBatch(target, leaseToken, checkpoint.cursor, batch);
      for (const id of ids) try { await this.queue.ensureDispatched({ executionId: id, mode: "live", startNodeIds: [target.nodeId], initialOnly: true }); } catch { this.logger.warn(`Could not dispatch provider poll execution ${id}.`); }
    } catch (error) {
      const code = error instanceof NodeFailure ? error.code : "PROVIDER_POLL_FAILED";
      const retry = error instanceof NodeFailure ? error.retryable : true;
      await this.prisma.$transaction(async (tx) => {
        const workflows = await tx.$queryRaw<Array<{ isActive: boolean; archivedAt: Date | null; publishedVersionId: string | null }>>`SELECT "isActive", "archivedAt", "publishedVersionId" FROM "Workflow" WHERE id = ${target.workflowId} FOR UPDATE`;
        if (!workflows[0]?.isActive || workflows[0].archivedAt || workflows[0].publishedVersionId !== target.versionId) return;
        await tx.providerPollCheckpoint.updateMany({ where: { workflowId: target.workflowId, nodeId: target.nodeId, workflowVersionId: target.versionId, leaseToken, leaseExpiresAt: { gt: new Date() } }, data: { state: retry ? "READY" : "ERROR", lastErrorCode: code, nextPollAt: new Date(Date.now() + target.pollMinutes * 60_000) } });
      });
      this.logger.warn(`Provider poll failed (${code}) for workflow ${target.workflowId}.`);
    } finally { await this.prisma.providerPollCheckpoint.updateMany({ where: { workflowId: target.workflowId, nodeId: target.nodeId, leaseToken }, data: { leaseToken: null, leaseExpiresAt: null } }); }
  }

  private async commitBatch(target: ProviderPollTarget, leaseToken: string, cursor: string, batch: Batch) {
    return this.prisma.$transaction(async (tx) => {
      const workflows = await tx.$queryRaw<Array<{ isActive: boolean; archivedAt: Date | null; publishedVersionId: string | null }>>`SELECT "isActive", "archivedAt", "publishedVersionId" FROM "Workflow" WHERE id = ${target.workflowId} FOR UPDATE`;
      if (!workflows[0]?.isActive || workflows[0].archivedAt || workflows[0].publishedVersionId !== target.versionId) return [];
      const rows = await tx.$queryRaw<Array<{ leaseToken: string | null; leaseExpiresAt: Date | null; state: string; cursor: string }>>`SELECT "leaseToken", "leaseExpiresAt", state, cursor FROM "ProviderPollCheckpoint" WHERE "workflowId" = ${target.workflowId} AND "nodeId" = ${target.nodeId} FOR UPDATE`;
      const checkpoint = rows[0];
      if (!checkpoint || checkpoint.state !== "READY" || checkpoint.leaseToken !== leaseToken || !checkpoint.leaseExpiresAt || checkpoint.leaseExpiresAt <= new Date() || checkpoint.cursor !== cursor) return [];
      const version = await tx.workflowVersion.findUnique({ where: { id: target.versionId }, select: { workflowId: true, graph: true } });
      if (!version || version.workflowId !== target.workflowId) return [];
      const graph = parseStoredWorkflowGraph(version.graph);
      const current = providerPollTargets(target.workflowId, target.versionId, target.workspaceId, graph).find((item) => item.nodeId === target.nodeId);
      if (!current || current.configHash !== target.configHash || current.pollMinutes !== target.pollMinutes) throw new NodeFailure("PROVIDER_POLL_CHANGED", "The trigger changed. Review it before continuing.", false);
      const requirements = liveCredentialRequirements(graph);
      const credentialIds = [...new Set(requirements.flatMap((item) => item.credentialId ? [item.credentialId] : []))];
      const credentials = credentialIds.length ? await tx.$queryRaw<Array<{ id: string; provider: string }>>`SELECT id, provider::text AS provider FROM "Credential" WHERE "workspaceId" = ${target.workspaceId} AND id IN (${Prisma.join(credentialIds)}) FOR SHARE` : [];
      const providers = new Map(credentials.map((item) => [item.id, item.provider]));
      if (requirements.some((item) => !item.credentialId || providers.get(item.credentialId) !== item.provider)) throw new NodeFailure("PROVIDER_POLL_NOT_READY", "A required connection is unavailable.", true);
      const ids: string[] = [];
      for (const change of batch.changes) {
        const key = { workflowId_nodeId_changeKey: { workflowId: target.workflowId, nodeId: target.nodeId, changeKey: change.key } };
        if (await tx.providerPollDelivery.findUnique({ where: key })) continue;
        const id = randomUUID();
        await tx.execution.create({ data: { id, workflowVersionId: target.versionId, mode: "LIVE", idempotencyKey: `provider-poll:${pollHash(`${target.workflowId}\0${target.nodeId}\0${change.key}`)}`, triggerData: redactValue({ source: target.provider, event: change.event, item: change.item }) as Prisma.InputJsonValue } });
        await tx.providerPollDelivery.create({ data: { workflowId: target.workflowId, nodeId: target.nodeId, changeKey: change.key, executionId: id } });
        ids.push(id);
      }
      if (await tx.providerPollDelivery.count({ where: { workflowId: target.workflowId, nodeId: target.nodeId } }) > maxReceipts) throw new NodeFailure("PROVIDER_POLL_LIMIT", "Trigger history is full. Review the checkpoint before continuing.", false);
      const updated = await tx.providerPollCheckpoint.updateMany({ where: { workflowId: target.workflowId, nodeId: target.nodeId, workflowVersionId: target.versionId, leaseToken, leaseExpiresAt: { gt: new Date() } }, data: { cursor: batch.cursor, nextPollAt: new Date(Date.now() + (batch.hasMore ? 0 : target.pollMinutes * 60_000)), lastErrorCode: null } });
      if (!updated.count) throw new NodeFailure("PROVIDER_POLL_LEASE_EXPIRED", "The polling lease expired before completion.", true);
      return ids;
    }, { maxWait: 2000, timeout: 30_000 });
  }
}
