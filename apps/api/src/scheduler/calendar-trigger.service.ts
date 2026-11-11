import { BadRequestException, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { CredentialProvider, ExecutionStatus, Prisma, WorkflowVersionStatus } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { isCalendarResourceId, type WorkflowGraph } from "@workflow/contracts";
import { CredentialService } from "../credentials/credential.service";
import { PrismaService } from "../database/prisma.service";
import { ExecutionQueueService } from "../execution/execution-queue.service";
import { NodeFailure } from "../execution/node-failure";
import { redactValue } from "../execution/redaction";
import { liveCredentialRequirements } from "../execution/live-readiness";
import { BackgroundWork } from "../platform/background-work";
import { parseStoredWorkflowGraph } from "../workflows/workflow-graph";
import { calendarSyncPage } from "./calendar-trigger-protocol";

const leaseMs = 5 * 60_000;
const maxSeen = 10_000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type Target = { workflowId: string; versionId: string; workspaceId: string; nodeId: string; credentialId: string; calendarId: string; event: "created" | "updated"; pollMinutes: number; configHash: string };
type Baseline = { target: Target; syncToken: string; baselineAt: Date; seen: Array<{ eventKey: string; revisionHash: string }> };

export function calendarTargets(workflowId: string, versionId: string, workspaceId: string, graph: WorkflowGraph): Target[] {
  return graph.nodes.filter((node) => node.type === "trigger.google-calendar.event").map((node) => {
    const credentialId = typeof node.config.credentialId === "string" ? node.config.credentialId : "";
    const calendarId = typeof node.config.calendarId === "string" ? node.config.calendarId.trim() : "";
    const event = node.config.event;
    const pollMinutes = Number(node.config.pollMinutes ?? 5);
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(credentialId) || !isCalendarResourceId(calendarId) || (event !== "created" && event !== "updated") || ![1, 5, 15, 60].includes(pollMinutes)) throw new NodeFailure("INVALID_INPUT", "Choose a Calendar connection, calendar, event and polling interval.", false);
    return { workflowId, versionId, workspaceId, nodeId: node.id, credentialId, calendarId, event, pollMinutes, configHash: hash(JSON.stringify([credentialId, calendarId, event])) };
  });
}

@Injectable()
export class CalendarTriggerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CalendarTriggerService.name);
  private readonly background = new BackgroundWork();
  private timer: NodeJS.Timeout | null = null;
  private scanning = false;
  protected readonly syncPage = calendarSyncPage;
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(CredentialService) private readonly credentials: CredentialService, @Inject(ExecutionQueueService) private readonly queue: ExecutionQueueService) {}

  onModuleInit() {
    if (process.env.PROCESS_ROLE === "worker" || process.env.SCHEDULER_ENABLED === "false") return;
    const scan = () => this.background.start(() => this.tick(), () => this.logger.error("Calendar trigger scheduler failed."));
    scan(); this.timer = setInterval(scan, 60_000);
  }
  async onModuleDestroy() { if (this.timer) clearInterval(this.timer); this.timer = null; await this.background.drain(); }

  async baselines(workflowId: string, versionId: string, workspaceId: string, graph: WorkflowGraph, force = false) {
    const result: Array<{ target: Target; baseline: Baseline | null }> = [];
    for (const target of calendarTargets(workflowId, versionId, workspaceId, graph)) {
      const existing = await this.prisma.calendarTriggerCheckpoint.findUnique({ where: { workflowId_nodeId: { workflowId, nodeId: target.nodeId } } });
      if (existing && !force) {
        if (existing.configHash !== target.configHash || existing.state !== "READY" || existing.workflowVersionId !== versionId) throw new BadRequestException({ code: "CALENDAR_TRIGGER_RECOVERY_REQUIRED", message: "Review the Calendar trigger before reactivating it." });
        result.push({ target, baseline: null }); continue;
      }
      const baselineAt = new Date();
      const credential = await this.credentials.readGoogleForExecution(target.credentialId, workspaceId, CredentialProvider.GOOGLE_CALENDAR);
      const accessToken = typeof credential.accessToken === "string" ? credential.accessToken : "";
      let pageToken: string | undefined; let syncToken: string | null = null;
      const seen = new Map<string, string>();
      for (let count = 0; count < 100; count++) {
        const page = await this.syncPage(accessToken, target.calendarId, undefined, pageToken);
        for (const item of page.events) seen.set(hash(item.id), hash(`${item.etag}\0${item.status}`));
        if (seen.size > maxSeen) throw new NodeFailure("CALENDAR_LIMIT", "This calendar is too large for the trigger. Choose a smaller calendar.", false);
        if (page.nextSync) { syncToken = page.nextSync; break; }
        pageToken = page.nextPage ?? undefined;
      }
      if (!syncToken) throw new NodeFailure("CALENDAR_LIMIT", "Calendar baseline did not complete within the page limit.", false);
      result.push({ target, baseline: { target, syncToken, baselineAt, seen: [...seen].map(([eventKey, revisionHash]) => ({ eventKey, revisionHash })) } });
    }
    return result;
  }

  async tick() {
    if (this.scanning) return; this.scanning = true;
    try {
      await this.recoverQueued();
      const versions = await this.prisma.workflowVersion.findMany({ where: { status: WorkflowVersionStatus.PUBLISHED, publishedFor: { is: { isActive: true, archivedAt: null } } }, include: { workflow: true } });
      for (const version of versions) {
        try {
          for (const target of calendarTargets(version.workflowId, version.id, version.workflow.workspaceId, parseStoredWorkflowGraph(version.graph))) {
            try { await this.poll(target); }
            catch { this.logger.warn(`Calendar trigger scan failed for node ${target.nodeId} in workflow ${version.workflowId}.`); }
          }
        }
        catch { this.logger.warn(`Calendar trigger scan failed for workflow ${version.workflowId}.`); }
      }
    } catch { this.logger.warn("Calendar trigger scheduler could not complete its scan."); }
    finally { this.scanning = false; }
  }

  private async recoverQueued() {
    const cutoff = new Date(Date.now() - 2 * 60_000);
    const queued = await this.prisma.$queryRaw<Array<{ id: string; nodeId: string }>>`SELECT e.id, d."nodeId" FROM "Execution" e JOIN "CalendarTriggerDelivery" d ON d."executionId" = e.id WHERE e.status = 'QUEUED' AND e.mode = 'LIVE' AND e."startedAt" IS NULL AND e."idempotencyKey" LIKE 'calendar:%' AND e."createdAt" < ${cutoff} ORDER BY e."createdAt" ASC LIMIT 100`;
    for (const item of queued) try { await this.queue.ensureDispatched({ executionId: item.id, mode: "live", startNodeIds: [item.nodeId], initialOnly: true }); } catch { this.logger.warn(`Could not restore Calendar execution ${item.id}.`); }
  }

  async poll(target: Target) {
    const leaseToken = randomUUID(); const now = new Date();
    const claimed = await this.prisma.calendarTriggerCheckpoint.updateMany({ where: { workflowId: target.workflowId, nodeId: target.nodeId, workflowVersionId: target.versionId, configHash: target.configHash, state: "READY", workflow: { isActive: true, archivedAt: null, publishedVersionId: target.versionId }, AND: [{ OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }] }, { OR: [{ nextPollAt: null }, { nextPollAt: { lte: now } }] }] }, data: { leaseToken, leaseExpiresAt: new Date(now.getTime() + leaseMs) } });
    if (!claimed.count) return;
    try {
      const checkpoint = await this.prisma.calendarTriggerCheckpoint.findUniqueOrThrow({ where: { workflowId_nodeId: { workflowId: target.workflowId, nodeId: target.nodeId } } });
      const credential = await this.credentials.readGoogleForExecution(target.credentialId, target.workspaceId, CredentialProvider.GOOGLE_CALENDAR);
      const page = await this.syncPage(typeof credential.accessToken === "string" ? credential.accessToken : "", target.calendarId, checkpoint.syncToken, checkpoint.pageToken ?? undefined);
      const ids = await this.commitPage(target, leaseToken, checkpoint.syncToken, page);
      for (const id of ids) try { await this.queue.ensureDispatched({ executionId: id, mode: "live", startNodeIds: [target.nodeId], initialOnly: true }); } catch { this.logger.warn(`Could not dispatch Calendar execution ${id}.`); }
    } catch (error) {
      const code = error instanceof NodeFailure ? error.code : "CALENDAR_POLL_FAILED";
      const retry = error instanceof NodeFailure ? error.retryable : true;
      await this.prisma.$transaction(async (tx) => {
        const workflows = await tx.$queryRaw<Array<{ isActive: boolean; archivedAt: Date | null; publishedVersionId: string | null }>>`SELECT "isActive", "archivedAt", "publishedVersionId" FROM "Workflow" WHERE id = ${target.workflowId} FOR UPDATE`;
        if (!workflows[0]?.isActive || workflows[0].archivedAt || workflows[0].publishedVersionId !== target.versionId) return;
        await tx.calendarTriggerCheckpoint.updateMany({ where: { workflowId: target.workflowId, nodeId: target.nodeId, workflowVersionId: target.versionId, leaseToken, leaseExpiresAt: { gt: new Date() } }, data: { state: retry ? "READY" : "ERROR", lastErrorCode: code, nextPollAt: new Date(Date.now() + target.pollMinutes * 60_000) } });
      });
      this.logger.warn(`Calendar trigger poll failed (${code}) for workflow ${target.workflowId}.`);
    } finally { await this.prisma.calendarTriggerCheckpoint.updateMany({ where: { workflowId: target.workflowId, nodeId: target.nodeId, leaseToken }, data: { leaseToken: null, leaseExpiresAt: null } }); }
  }

  private async commitPage(target: Target, leaseToken: string, syncToken: string, page: Awaited<ReturnType<typeof calendarSyncPage>>) {
    return this.prisma.$transaction(async (tx) => {
      const workflows = await tx.$queryRaw<Array<{ isActive: boolean; archivedAt: Date | null; publishedVersionId: string | null }>>`SELECT "isActive", "archivedAt", "publishedVersionId" FROM "Workflow" WHERE id = ${target.workflowId} FOR UPDATE`;
      if (!workflows[0]?.isActive || workflows[0].archivedAt || workflows[0].publishedVersionId !== target.versionId) return [];
      const checkpoints = await tx.$queryRaw<Array<{ leaseToken: string | null; leaseExpiresAt: Date | null; state: string; syncToken: string; baselineAt: Date }>>`SELECT "leaseToken", "leaseExpiresAt", state, "syncToken", "baselineAt" FROM "CalendarTriggerCheckpoint" WHERE "workflowId" = ${target.workflowId} AND "nodeId" = ${target.nodeId} FOR UPDATE`;
      const checkpoint = checkpoints[0];
      if (!checkpoint || checkpoint.state !== "READY" || checkpoint.leaseToken !== leaseToken || !checkpoint.leaseExpiresAt || checkpoint.leaseExpiresAt <= new Date() || checkpoint.syncToken !== syncToken) return [];
      const version = await tx.workflowVersion.findUnique({ where: { id: target.versionId }, select: { workflowId: true, graph: true } });
      if (!version || version.workflowId !== target.workflowId) return [];
      const graph = parseStoredWorkflowGraph(version.graph);
      const current = calendarTargets(target.workflowId, target.versionId, target.workspaceId, graph).find((item) => item.nodeId === target.nodeId);
      if (!current || current.configHash !== target.configHash || current.pollMinutes !== target.pollMinutes) throw new NodeFailure("CALENDAR_TRIGGER_CHANGED", "The Calendar trigger changed; review it before continuing.", false);
      const requirements = liveCredentialRequirements(graph, target.nodeId);
      const credentialIds = [...new Set(requirements.flatMap((item) => item.credentialId ? [item.credentialId] : []))];
      const credentials = credentialIds.length ? await tx.$queryRaw<Array<{ id: string; provider: string }>>`SELECT id, provider::text AS provider FROM "Credential" WHERE "workspaceId" = ${target.workspaceId} AND id IN (${Prisma.join(credentialIds)}) FOR SHARE` : [];
      const providers = new Map(credentials.map((item) => [item.id, item.provider]));
      if (requirements.some((item) => !item.credentialId || providers.get(item.credentialId) !== item.provider)) throw new NodeFailure("CALENDAR_NOT_READY", "A required connection is unavailable.", true);
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60_000);
      await tx.$executeRaw`DELETE FROM "CalendarTriggerDelivery" d WHERE d."workflowId" = ${target.workflowId} AND d."nodeId" = ${target.nodeId} AND d."createdAt" < ${cutoff} AND (d."executionId" IS NULL OR EXISTS (SELECT 1 FROM "Execution" e WHERE e.id = d."executionId" AND e.status IN ('SUCCEEDED', 'FAILED', 'CANCELLED')))`;
      const ids: string[] = [];
      for (const event of page.events) {
        const eventKey = hash(event.id); const revisionHash = hash(`${event.etag}\0${event.status}`);
        const key = { workflowId_nodeId_eventKey: { workflowId: target.workflowId, nodeId: target.nodeId, eventKey } };
        const previous = await tx.calendarTriggerSeen.findUnique({ where: key });
        const kind = previous || (event.status !== "cancelled" && Date.parse(event.created) < checkpoint.baselineAt.getTime()) ? "updated" : "created";
        const changed = !previous || previous.revisionHash !== revisionHash;
        await tx.calendarTriggerSeen.upsert({ where: key, create: { workflowId: target.workflowId, nodeId: target.nodeId, eventKey, revisionHash }, update: { revisionHash } });
        if (!changed || event.status === "cancelled" || kind !== target.event) continue;
        const changeKey = hash(`${eventKey}\0${revisionHash}\0${kind}`);
        const receipt = await tx.calendarTriggerDelivery.findUnique({ where: { workflowId_nodeId_changeKey: { workflowId: target.workflowId, nodeId: target.nodeId, changeKey } } });
        if (receipt) continue;
        const id = randomUUID();
        await tx.execution.create({ data: { id, workflowVersionId: target.versionId, mode: "LIVE", triggerNodeId: target.nodeId, idempotencyKey: `calendar:${hash(`${target.workflowId}\0${target.nodeId}\0${changeKey}`)}`, triggerData: redactValue({ source: "google-calendar", event: kind, item: event }) as Prisma.InputJsonValue } });
        await tx.calendarTriggerDelivery.create({ data: { workflowId: target.workflowId, nodeId: target.nodeId, changeKey, executionId: id } });
        ids.push(id);
      }
      if (await tx.calendarTriggerSeen.count({ where: { workflowId: target.workflowId, nodeId: target.nodeId } }) > maxSeen) throw new NodeFailure("CALENDAR_LIMIT", "Calendar trigger history is full; review the trigger.", false);
      if (await tx.calendarTriggerDelivery.count({ where: { workflowId: target.workflowId, nodeId: target.nodeId } }) > maxSeen) throw new NodeFailure("CALENDAR_LIMIT", "Calendar delivery history is full; review the trigger.", false);
      const updated = await tx.calendarTriggerCheckpoint.updateMany({ where: { workflowId: target.workflowId, nodeId: target.nodeId, workflowVersionId: target.versionId, leaseToken, leaseExpiresAt: { gt: new Date() } }, data: { syncToken: page.nextSync ?? syncToken, pageToken: page.nextPage, nextPollAt: new Date(Date.now() + (page.nextPage ? 1 : target.pollMinutes) * 60_000), lastErrorCode: null } });
      if (!updated.count) throw new NodeFailure("CALENDAR_LEASE_EXPIRED", "Calendar poll lease expired before completion.", true);
      return ids;
    }, { maxWait: 2000, timeout: 15_000 });
  }
}
