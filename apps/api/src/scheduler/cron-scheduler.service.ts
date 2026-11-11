import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ExecutionStatus, WorkflowVersionStatus } from "@prisma/client";
import { parseExpression } from "cron-parser";
import { PrismaService } from "../database/prisma.service";
import { ExecutionQueueService } from "../execution/execution-queue.service";
import { ExecutionService } from "../execution/execution.service";
import { parseStoredWorkflowGraph } from "../workflows/workflow-graph";
import { BackgroundWork } from "../platform/background-work";

@Injectable()
export class CronSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CronSchedulerService.name);
  private readonly dispatched = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private recoveryCursor = "";
  private recovering = false;
  private readonly background = new BackgroundWork();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExecutionService) private readonly executions: ExecutionService,
    @Inject(ExecutionQueueService) private readonly queue: ExecutionQueueService,
  ) {}

  onModuleInit() {
    if (process.env.PROCESS_ROLE === "worker" || process.env.SCHEDULER_ENABLED === "false") return;
    const scan = () => this.background.start(() => this.tick(), () => this.logger.error("Cron scheduler scan failed."));
    scan();
    this.timer = setInterval(scan, 60_000);
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.background.drain();
  }

  private async tick(now = new Date()) {
    // A tick only considers occurrences from the last 65 seconds. Keeping a
    // slightly longer window prevents unbounded growth without changing the
    // persistent idempotency key that protects restarts and multiple APIs.
    for (const [key, scheduledAt] of this.dispatched) {
      if (scheduledAt < now.getTime() - 120_000) this.dispatched.delete(key);
    }
    try { await this.recoverQueued(now); }
    catch { this.logger.warn("Could not scan queued cron executions for recovery."); }
    let versions: Awaited<ReturnType<typeof this.prisma.workflowVersion.findMany>>;
    try {
      versions = await this.prisma.workflowVersion.findMany({ where: { status: WorkflowVersionStatus.PUBLISHED, publishedFor: { is: { isActive: true, archivedAt: null } } } });
    } catch {
      this.logger.error("Cron scheduler could not load published workflows; the next scan will retry.");
      return;
    }
    for (const version of versions) {
      let graph: ReturnType<typeof parseStoredWorkflowGraph>;
      try { graph = parseStoredWorkflowGraph(version.graph); }
      catch { this.logger.warn(`Cron scheduler could not read workflow version ${version.id}.`); continue; }
      for (const node of graph.nodes.filter((item) => item.type === "trigger.cron")) {
        const expression = typeof node.config.expression === "string" ? node.config.expression : "";
        const timezone = typeof node.config.timezone === "string" ? node.config.timezone : "Asia/Ho_Chi_Minh";
        const scheduledAt = previousOccurrence(expression, timezone, now);
        if (!scheduledAt) continue;
        const key = `${version.id}:${node.id}:${scheduledAt.toISOString()}`;
        if (this.dispatched.has(key)) continue;
        try {
          const execution = await this.executions.createCronScheduledExecution(version.id, { scheduledAt: scheduledAt.toISOString(), timezone }, `cron:${key}`, node.id);
          await this.queue.dispatch({ executionId: execution.id, mode: "live", startNodeIds: [node.id], initialOnly: true });
          this.dispatched.set(key, scheduledAt.getTime());
        } catch {
          // Database and provider exceptions may contain credentials or payloads.
          this.logger.error(`Cron dispatch failed for workflow version ${version.id}.`);
        }
      }
    }
  }

  /** Redis may be unavailable after the execution is committed. Requeue only
   * jobs that never started; an uncertain provider call is never replayed. */
  async recoverQueued(now = new Date()) {
    if (this.recovering) return;
    this.recovering = true;
    try {
      const rows = await this.prisma.execution.findMany({
        where: { status: ExecutionStatus.QUEUED, mode: "LIVE", startedAt: null, resumeToken: null, idempotencyKey: { startsWith: "cron:" }, createdAt: { lt: new Date(now.getTime() - 120_000) }, ...(this.recoveryCursor ? { id: { gt: this.recoveryCursor } } : {}) },
        select: { id: true }, orderBy: { id: "asc" }, take: 100,
      });
      for (const row of rows) {
        try { await this.queue.ensureDispatched({ executionId: row.id, mode: "live", initialOnly: true }); }
        catch { this.logger.warn(`Could not restore queued cron execution ${row.id}.`); }
      }
      this.recoveryCursor = rows.length === 100 ? rows[rows.length - 1]!.id : "";
    } finally { this.recovering = false; }
  }
}

function previousOccurrence(expression: string, timezone: string, now: Date): Date | null {
  try {
    const occurrence = parseExpression(expression, { currentDate: now, tz: timezone }).prev().toDate();
    return now.getTime() - occurrence.getTime() < 65_000 ? occurrence : null;
  } catch {
    return null;
  }
}
