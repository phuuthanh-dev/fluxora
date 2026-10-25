import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { WorkflowVersionStatus } from "@prisma/client";
import { parseExpression } from "cron-parser";
import { PrismaService } from "../database/prisma.service";
import { ExecutionQueueService } from "../execution/execution-queue.service";
import { ExecutionService } from "../execution/execution.service";
import { parseWorkflowGraph } from "../workflows/workflow-graph";

@Injectable()
export class CronSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CronSchedulerService.name);
  private readonly dispatched = new Set<string>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExecutionService) private readonly executions: ExecutionService,
    @Inject(ExecutionQueueService) private readonly queue: ExecutionQueueService,
  ) {}

  onModuleInit() {
    if (process.env.PROCESS_ROLE === "worker" || process.env.SCHEDULER_ENABLED === "false") return;
    void this.tick();
    this.timer = setInterval(() => { void this.tick(); }, 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(now = new Date()) {
    const versions = await this.prisma.workflowVersion.findMany({ where: { status: WorkflowVersionStatus.PUBLISHED } });
    for (const version of versions) {
      const graph = parseWorkflowGraph(version.graph);
      for (const node of graph.nodes.filter((item) => item.type === "trigger.cron")) {
        const expression = typeof node.config.expression === "string" ? node.config.expression : "";
        const timezone = typeof node.config.timezone === "string" ? node.config.timezone : "Asia/Ho_Chi_Minh";
        const scheduledAt = previousOccurrence(expression, timezone, now);
        if (!scheduledAt) continue;
        const key = `${version.id}:${node.id}:${scheduledAt.toISOString()}`;
        if (this.dispatched.has(key)) continue;
        this.dispatched.add(key);
        try {
          const execution = await this.executions.createScheduledExecution(version.id, { scheduledAt: scheduledAt.toISOString(), timezone });
          await this.queue.dispatch({ executionId: execution.id, mode: "live" });
        } catch (error) {
          this.logger.error(`Cron dispatch failed for workflow version ${version.id}.`, error instanceof Error ? error.stack : undefined);
        }
      }
    }
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
