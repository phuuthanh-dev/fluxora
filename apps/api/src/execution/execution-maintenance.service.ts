import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ExecutionStatus } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { ExecutionService } from "./execution.service";
import { executionRetentionPolicy } from "./retention-policy";
import { BackgroundWork } from "../platform/background-work";
export { executionRetentionPolicy } from "./retention-policy";

const terminalStatuses = [ExecutionStatus.SUCCEEDED, ExecutionStatus.FAILED, ExecutionStatus.CANCELLED];

@Injectable()
export class ExecutionMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private leaseTimer: NodeJS.Timeout | null = null;
  private leaseScanRunning = false;
  private leaseCursor = "";
  private readonly logger = new Logger(ExecutionMaintenanceService.name);
  private readonly background = new BackgroundWork();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExecutionService) private readonly executions: ExecutionService,
  ) {}

  onModuleInit() {
    if (process.env.PROCESS_ROLE === "worker" || process.env.EXECUTION_MAINTENANCE_ENABLED === "false") return;
    this.background.start(() => this.maintain(), () => this.logger.warn("Execution maintenance failed."));
    this.timer = setInterval(() => { this.background.start(() => this.pruneFinished(), () => this.logger.warn("Execution retention failed.")); }, 60 * 60 * 1000);
    this.leaseTimer = setInterval(() => { this.background.start(() => this.failExpiredLeases(), () => this.logger.warn("Execution lease scan failed.")); }, 60 * 1000);
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.leaseTimer) clearInterval(this.leaseTimer);
    this.timer = null;
    this.leaseTimer = null;
    await this.background.drain();
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
        where: { status: ExecutionStatus.RUNNING, leaseExpiresAt: { lte: now }, ...(this.leaseCursor ? { id: { gt: this.leaseCursor } } : {}) },
        select: { id: true },
        orderBy: { id: "asc" },
        take: 100,
      });
      let recovered = 0;
      for (const execution of expired) {
        try {
          if (await this.executions.failFromMaintenance(execution.id, "EXECUTION_LEASE_EXPIRED", "The worker did not finish before its lease expired. A provider request already sent may still complete; check the provider before retrying.", now)) recovered += 1;
        } catch {
          // One bad row must not starve the rest. Do not log raw database
          // errors, which can contain execution inputs or connection data.
          this.logger.warn(`Could not recover expired execution ${execution.id}; a later scan will retry.`);
        }
      }
      this.leaseCursor = expired.length === 100 ? expired[expired.length - 1]!.id : "";
      return recovered;
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
