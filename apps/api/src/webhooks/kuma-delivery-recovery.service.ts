import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ExecutionStatus } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { ExecutionQueueService } from "../execution/execution-queue.service";

/** Recover only accepted Kuma deliveries that have never begun execution. */
@Injectable()
export class KumaDeliveryRecoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(this.constructor.name);
  private timer: NodeJS.Timeout | null = null;
  private cursor = "";
  private scanning = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(ExecutionQueueService) private readonly queue: ExecutionQueueService) {}
  protected get deliveryPrefix(): string { return "kuma-v2:"; }
  protected get providerName(): string { return "Kuma"; }

  onModuleInit() {
    if (process.env.PROCESS_ROLE === "worker" || process.env.SCHEDULER_ENABLED === "false") return;
    void this.recover();
    this.timer = setInterval(() => { void this.recover(); }, 60_000);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async recover(now = new Date()) {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const executions = await this.prisma.execution.findMany({
        where: { status: ExecutionStatus.QUEUED, mode: "LIVE", startedAt: null, idempotencyKey: { startsWith: this.deliveryPrefix }, createdAt: { lt: new Date(now.getTime() - 2 * 60_000) }, ...(this.cursor ? { id: { gt: this.cursor } } : {}) },
        select: { id: true }, orderBy: { id: "asc" }, take: 100,
      });
      for (const execution of executions) {
        try { await this.queue.ensureDispatched({ executionId: execution.id, mode: "live", initialOnly: true }); }
        catch { this.logger.warn(`Could not restore ${this.providerName} execution ${execution.id}.`); }
      }
      this.cursor = executions.length === 100 ? executions[executions.length - 1]!.id : "";
    } catch { this.logger.warn(`Could not scan queued ${this.providerName} executions for recovery.`); }
    finally { this.scanning = false; }
  }
}
