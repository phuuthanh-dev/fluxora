import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ExecutionStatus } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { ExecutionService } from "./execution.service";
import { executionRetentionPolicy } from "./retention-policy";
export { executionRetentionPolicy } from "./retention-policy";

const terminalStatuses = [ExecutionStatus.SUCCEEDED, ExecutionStatus.FAILED, ExecutionStatus.CANCELLED];

@Injectable()
export class ExecutionMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private leaseTimer: NodeJS.Timeout | null = null;
  private leaseScanRunning = false;
  private readonly logger = new Logger(ExecutionMaintenanceService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExecutionService) private readonly executions: ExecutionService,
  ) {}

  onModuleInit() {
    if (process.env.PROCESS_ROLE === "worker" || process.env.EXECUTION_MAINTENANCE_ENABLED === "false") return;
    void this.maintain().catch(() => this.logger.warn("Execution maintenance failed."));
    this.timer = setInterval(() => { void this.pruneFinished().catch(() => this.logger.warn("Execution retention failed.")); }, 60 * 60 * 1000);
    this.leaseTimer = setInterval(() => { void this.failExpiredLeases().catch(() => this.logger.warn("Execution lease scan failed.")); }, 60 * 1000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.leaseTimer) clearInterval(this.leaseTimer);
  }

  async maintain(now = new Date()) {
    const recovered = await this.failExpiredLeases(now);
    const pruned = await this.pruneFinished(now);
    return { recovered, pruned };
  }

  async failExpiredLeases(now = new Date()) {
    if (this.leaseScanRunning) return 0;
    this.leaseScanRunning = true;
    try {
      const expired = await this.prisma.execution.findMany({
        where: { status: ExecutionStatus.RUNNING, leaseExpiresAt: { lte: now } },
        select: { id: true },
        take: 100,
      });
      for (const execution of expired) {
        await this.executions.failFromMaintenance(execution.id, "EXECUTION_LEASE_EXPIRED", "The worker did not finish before its lease expired. A provider request already sent may still complete; check the provider before retrying.", now);
      }
      return expired.length;
    } finally {
      this.leaseScanRunning = false;
    }
  }

  async pruneFinished(now = new Date()) {
    const policy = executionRetentionPolicy();
    const successBefore = new Date(now.getTime() - policy.successDays * 24 * 60 * 60 * 1000);
    const failedBefore = new Date(now.getTime() - policy.failedDays * 24 * 60 * 60 * 1000);
    // Preserve external delivery identities for a bounded replay window.
    // This is a minimum local retention window, not an exactly-once promise.
    const vercelReplayCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const outsideVercelReplayWindow = { OR: [
      { idempotencyKey: null },
      { AND: [{ idempotencyKey: { not: { startsWith: "vercel-v1:" } } }, { idempotencyKey: { not: { startsWith: "trello-v1:" } } }, { idempotencyKey: { not: { startsWith: "sentry-v1:" } } }] },
      { completedAt: { lte: vercelReplayCutoff } },
    ] };
    const byAge = await this.prisma.execution.deleteMany({
      where: {
        AND: [outsideVercelReplayWindow, { OR: [
          { status: ExecutionStatus.SUCCEEDED, completedAt: { lt: successBefore } },
          { status: { in: [ExecutionStatus.FAILED, ExecutionStatus.CANCELLED] }, completedAt: { lt: failedBefore } },
        ] }],
      },
    });
    if (policy.maxCount === 0) return byAge.count;
    const overflow = await this.prisma.execution.findMany({
      where: { status: { in: terminalStatuses }, ...outsideVercelReplayWindow },
      orderBy: { completedAt: "desc" },
      skip: policy.maxCount,
      select: { id: true },
    });
    if (!overflow.length) return byAge.count;
    const byCount = await this.prisma.execution.deleteMany({ where: { id: { in: overflow.map((execution) => execution.id) }, status: { in: terminalStatuses }, ...outsideVercelReplayWindow } });
    return byAge.count + byCount.count;
  }
}
