import { BadRequestException, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, WorkflowVersionStatus } from "@prisma/client";
import type { WorkflowGraph } from "@workflow/contracts";
import { PrismaService } from "../database/prisma.service";
import { ExecutionQueueService } from "../execution/execution-queue.service";
import { NodeFailure } from "../execution/node-failure";
import { parseWorkflowGraph } from "../workflows/workflow-graph";
import { RssTriggerPoller, canResumeRssCheckpoint, rssFeedUrlHash, rssTargets, type RssTarget } from "./rss-trigger-poller";
import { PrismaRssTriggerStore } from "./rss-trigger.store";
import { BackgroundWork } from "../platform/background-work";

@Injectable()
export class RssTriggerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RssTriggerService.name);
  private readonly poller: RssTriggerPoller;
  private timer: NodeJS.Timeout | null = null;
  private scanning = false;
  private recoveryCursor = "";
  private readonly background = new BackgroundWork();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(ExecutionQueueService) private readonly queue: ExecutionQueueService) {
    this.poller = new RssTriggerPoller(new PrismaRssTriggerStore(prisma));
  }
  onModuleInit() {
    if (process.env.PROCESS_ROLE === "worker" || process.env.SCHEDULER_ENABLED === "false") return;
    const scan = () => this.background.start(() => this.tick(), () => this.logger.error("RSS trigger scheduler failed."));
    scan();
    this.timer = setInterval(scan, 60_000);
  }
  async onModuleDestroy() { if (this.timer) clearInterval(this.timer); this.timer = null; await this.background.drain(); }

  /** Only first activation performs an external baseline request. Existing
   * checkpoints resume; the workflow transaction rechecks version and state. */
  async baselines(workflowId: string, versionId: string, graph: WorkflowGraph) {
    const targets = rssTargets(workflowId, versionId, graph);
    const baselines: Array<{ target: RssTarget; baseline: Awaited<ReturnType<RssTriggerPoller["baseline"]>> | null }> = [];
    for (const target of targets) {
      const existing = await this.prisma.$queryRaw<Array<{ feedUrlHash: string; state: string; lastErrorCode: string | null }>>`SELECT "feedUrlHash", "state", "lastErrorCode" FROM "RssTriggerCheckpoint" WHERE "workflowId" = ${workflowId} AND "nodeId" = ${target.nodeId}`;
      if (existing[0]) {
        if (!canResumeRssCheckpoint(existing[0].state, existing[0].lastErrorCode)) throw new BadRequestException({ code: "RSS_TRIGGER_RECOVERY_REQUIRED", message: "Review the RSS trigger before reactivating it." });
        if (existing[0].feedUrlHash !== rssFeedUrlHash(target.url)) throw new BadRequestException({ code: "RSS_FEED_CHANGED", message: "The feed changed; reset the RSS trigger before activating it." });
        baselines.push({ target, baseline: null });
      } else {
        try { baselines.push({ target, baseline: await this.poller.baseline(target) }); }
        catch (error) { if (error instanceof NodeFailure) throw new BadRequestException({ code: error.code, message: error.message }); throw error; }
      }
    }
    return baselines;
  }

  /** Called only after the owner explicitly confirms a checkpoint reset. */
  async freshBaselines(workflowId: string, versionId: string, graph: WorkflowGraph) {
    const result: Array<{ target: RssTarget; baseline: Awaited<ReturnType<RssTriggerPoller["baseline"]>> }> = [];
    for (const target of rssTargets(workflowId, versionId, graph)) {
      try { result.push({ target, baseline: await this.poller.baseline(target) }); }
      catch (error) { if (error instanceof NodeFailure) throw new BadRequestException({ code: error.code, message: error.message }); throw error; }
    }
    return result;
  }

  async tick() {
    if (this.scanning) return;
    this.scanning = true;
    try {
      await this.recoverQueued();
      const versions = await this.prisma.workflowVersion.findMany({ where: { status: WorkflowVersionStatus.PUBLISHED, publishedFor: { is: { isActive: true, archivedAt: null } } }, select: { id: true, workflowId: true, graph: true } });
      for (const version of versions) {
        try {
          const targets = rssTargets(version.workflowId, version.id, parseWorkflowGraph(version.graph));
          for (const target of targets) {
            const accepted = await this.poller.poll(target);
            for (const executionId of accepted ?? []) {
              try { await this.queue.ensureDispatched({ executionId, mode: "live", startNodeIds: [target.nodeId], initialOnly: true }); }
              catch { this.logger.warn(`Could not dispatch RSS execution ${executionId}; recovery will retry.`); }
            }
          }
        } catch { this.logger.warn(`RSS trigger scan failed for workflow ${version.workflowId}.`); }
      }
    } catch { this.logger.warn("RSS trigger scheduler could not complete its scan."); }
    finally { this.scanning = false; }
  }

  /** Only never-started deliveries can be safely requeued automatically. */
  async recoverQueued(now = new Date()) {
    const cutoff = new Date(now.getTime() - 2 * 60_000);
    const after = this.recoveryCursor ? Prisma.sql`AND e.id > ${this.recoveryCursor}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Array<{ id: string; nodeId: string }>>`SELECT e.id, d."nodeId" FROM "Execution" e JOIN "RssTriggerDelivery" d ON d."executionId" = e.id WHERE e.status = 'QUEUED' AND e.mode = 'LIVE' AND e."startedAt" IS NULL AND e."idempotencyKey" LIKE 'rss-v2:%' AND e."createdAt" < ${cutoff} ${after} ORDER BY e.id ASC LIMIT 100`;
    for (const row of rows) {
      try { await this.queue.ensureDispatched({ executionId: row.id, mode: "live", startNodeIds: [row.nodeId], initialOnly: true }); }
      catch { this.logger.warn(`Could not restore RSS execution ${row.id}.`); }
    }
    this.recoveryCursor = rows.length === 100 ? rows[rows.length - 1]!.id : "";
  }
}
