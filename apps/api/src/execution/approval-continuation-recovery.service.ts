import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ExecutionStatus } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { ExecutionQueueService } from "./execution-queue.service";
import { BackgroundWork } from "../platform/background-work";

/** Recover persisted approval continuations whose first queue dispatch failed. */
@Injectable()
export class ApprovalContinuationRecoveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApprovalContinuationRecoveryService.name);
  private timer: NodeJS.Timeout | null = null;
  private scanning = false;
  private cursor = "";
  private readonly background = new BackgroundWork();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(ExecutionQueueService) private readonly queue: ExecutionQueueService) {}

  onModuleInit() {
    if (process.env.PROCESS_ROLE === "worker" || process.env.SCHEDULER_ENABLED === "false") return;
    const scan = () => this.background.start(() => this.recover(), () => this.logger.warn("Approval continuation recovery failed."));
    scan();
    this.timer = setInterval(scan, 60_000);
  }
  async onModuleDestroy() { if (this.timer) clearInterval(this.timer); this.timer = null; await this.background.drain(); }

  async recover(now = new Date()) {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const rows = await this.prisma.execution.findMany({
        where: { status: ExecutionStatus.QUEUED, resumeToken: { not: null }, resumeQueuedAt: { lt: new Date(now.getTime() - 30_000) }, ...(this.cursor ? { id: { gt: this.cursor } } : {}) },
        select: { id: true, mode: true, resumeToken: true }, orderBy: { id: "asc" }, take: 100,
      });
      for (const row of rows) {
        if (!row.resumeToken) continue;
        try { await this.queue.ensureDispatched({ executionId: row.id, mode: row.mode === "MOCK" ? "mock" : "live", resumeToken: row.resumeToken }); }
        catch { this.logger.warn(`Could not restore approval continuation ${row.id}.`); }
      }
      this.cursor = rows.length === 100 ? rows[rows.length - 1]!.id : "";
    } catch { this.logger.warn("Could not scan approval continuations for recovery."); }
    finally { this.scanning = false; }
  }
}
