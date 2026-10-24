import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ExecutionStatus } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { ExecutionService } from "./execution.service";

const terminalStatuses = [ExecutionStatus.SUCCEEDED, ExecutionStatus.FAILED, ExecutionStatus.CANCELLED];

export function executionRetentionPolicy(environment: NodeJS.ProcessEnv = process.env) {
  return {
    successDays: positiveInteger(environment.EXECUTION_RETENTION_SUCCESS_DAYS, 14),
    failedDays: positiveInteger(environment.EXECUTION_RETENTION_FAILED_DAYS, 30),
    maxCount: nonNegativeInteger(environment.EXECUTION_RETENTION_MAX_COUNT, 10_000),
  };
}

@Injectable()
export class ExecutionMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExecutionService) private readonly executions: ExecutionService,
  ) {}

  onModuleInit() {
    if (process.env.PROCESS_ROLE === "worker" || process.env.EXECUTION_MAINTENANCE_ENABLED === "false") return;
    void this.maintain();
    this.timer = setInterval(() => { void this.maintain(); }, 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async maintain(now = new Date()) {
    const recovered = await this.failExpiredLeases(now);
    const pruned = await this.pruneFinished(now);
    return { recovered, pruned };
  }

  async failExpiredLeases(now = new Date()) {
    const expired = await this.prisma.execution.findMany({
      where: { status: ExecutionStatus.RUNNING, leaseExpiresAt: { lte: now } },
      select: { id: true },
      take: 100,
    });
    for (const execution of expired) {
      await this.executions.failFromMaintenance(execution.id, "EXECUTION_LEASE_EXPIRED", "Execution worker stopped before completion.", now);
    }
    return expired.length;
  }

  async pruneFinished(now = new Date()) {
    const policy = executionRetentionPolicy();
    const successBefore = new Date(now.getTime() - policy.successDays * 24 * 60 * 60 * 1000);
    const failedBefore = new Date(now.getTime() - policy.failedDays * 24 * 60 * 60 * 1000);
    const byAge = await this.prisma.execution.deleteMany({
      where: {
        OR: [
          { status: ExecutionStatus.SUCCEEDED, completedAt: { lt: successBefore } },
          { status: { in: [ExecutionStatus.FAILED, ExecutionStatus.CANCELLED] }, completedAt: { lt: failedBefore } },
        ],
      },
    });
    if (policy.maxCount === 0) return byAge.count;
    const overflow = await this.prisma.execution.findMany({
      where: { status: { in: terminalStatuses } },
      orderBy: { completedAt: "desc" },
      skip: policy.maxCount,
      select: { id: true },
    });
    if (!overflow.length) return byAge.count;
    const byCount = await this.prisma.execution.deleteMany({ where: { id: { in: overflow.map((execution) => execution.id) } } });
    return byAge.count + byCount.count;
  }
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
