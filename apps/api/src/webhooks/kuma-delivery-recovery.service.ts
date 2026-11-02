import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ExecutionStatus } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { ExecutionQueueService } from "../execution/execution-queue.service";
import { BackgroundWork } from "../platform/background-work";

/** Recover only accepted Kuma deliveries that have never begun execution. */
@Injectable()
export class KumaDeliveryRecoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(this.constructor.name);
  private timer: NodeJS.Timeout | null = null;
  private cursor = "";
  private scanning = false;
  private readonly background = new BackgroundWork();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(ExecutionQueueService) private readonly queue: ExecutionQueueService) {}
  protected get deliveryPrefix(): string { return "kuma-v2:"; }
  protected get providerName(): string { return "Kuma"; }

  onModuleInit() {
    if (process.env.PROCESS_ROLE === "worker" || process.env.SCHEDULER_ENABLED === "false") return;
    const scan = () => this.background.start(() => this.recover(), () => this.logger.warn(`${this.providerName} delivery recovery failed.`));
    scan();
    this.timer = setInterval(scan, 60_000);
  }
  async onModuleDestroy() { if (this.timer) clearInterval(this.timer); this.timer = null; await this.background.drain(); }

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
