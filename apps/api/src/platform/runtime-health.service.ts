import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { ExecutionQueueService, type QueueHealth } from "../execution/execution-queue.service";

export type RuntimeReadiness = {
  status: "ready" | "degraded";
  service: "workflow-api";
  timestamp: string;
  checks: {
    database: "ready" | "unavailable";
    queue: QueueHealth;
  };
};

@Injectable()
export class RuntimeHealthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExecutionQueueService) private readonly queue: ExecutionQueueService,
  ) {}

  async readiness(): Promise<RuntimeReadiness> {
    const [database, queue] = await Promise.all([this.databaseStatus(), this.queue.health()]);
    return {
      status: database === "ready" && queue.status === "ready" ? "ready" : "degraded",
      service: "workflow-api",
      timestamp: new Date().toISOString(),
      checks: { database, queue },
    };
  }

  private async databaseStatus() {
    try {
      await this.prisma.$queryRawUnsafe("SELECT 1");
      return "ready" as const;
    } catch {
      return "unavailable" as const;
    }
  }
}
