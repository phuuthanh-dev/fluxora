import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { ExecutionService } from "./execution.service";
import { resolveWorkerConcurrency } from "./worker-concurrency";

type QueueMode = "inline" | "redis";
export type ExecutionJob = { executionId: string; mode: "mock" | "live"; startNodeIds?: string[]; debugNodeId?: string };
export type QueueHealth = { status: "ready" | "unavailable"; mode: QueueMode; configuredWorkerConcurrency: number; waiting: number; active: number; delayed: number; failed: number };
export const executionQueueName = "workflow-executions";

export function resolveQueueMode(value = process.env.EXECUTION_QUEUE_MODE): QueueMode {
  if (!value || value === "inline") return "inline";
  if (value === "redis") return "redis";
  throw new Error("EXECUTION_QUEUE_MODE must be inline or redis.");
}

@Injectable()
export class ExecutionQueueService implements OnModuleDestroy {
  private readonly mode = resolveQueueMode();
  private connection: IORedis | null = null;
  private queue: Queue<ExecutionJob> | null = null;

  constructor(@Inject(ExecutionService) private readonly executions: ExecutionService) {}

  async dispatch(job: ExecutionJob) {
    if (this.mode === "inline") return this.executions.run(job.executionId, job.mode, job.startNodeIds, job.debugNodeId);
    const queue = this.getQueue();
    await queue.add("execute", job, { jobId: job.executionId, removeOnComplete: 100, removeOnFail: 100 });
  }

  async health(): Promise<QueueHealth> {
    const configuredWorkerConcurrency = resolveWorkerConcurrency();
    if (this.mode === "inline") return { status: "ready", mode: "inline", configuredWorkerConcurrency, waiting: 0, active: 0, delayed: 0, failed: 0 };
    try {
      const queue = this.getQueue();
      await withTimeout(this.connection?.ping() ?? Promise.reject(new Error("Redis connection was not created.")), 2_000);
      const counts = await withTimeout(queue.getJobCounts("wait", "active", "delayed", "failed"), 2_000);
      return { status: "ready", mode: "redis", configuredWorkerConcurrency, waiting: counts.wait ?? 0, active: counts.active ?? 0, delayed: counts.delayed ?? 0, failed: counts.failed ?? 0 };
    } catch {
      return { status: "unavailable", mode: "redis", configuredWorkerConcurrency, waiting: 0, active: 0, delayed: 0, failed: 0 };
    }
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.connection?.quit();
  }

  private getQueue() {
    if (!this.queue) {
      this.connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { connectTimeout: 2_000, maxRetriesPerRequest: null });
      this.queue = new Queue<ExecutionJob>(executionQueueName, { connection: this.connection });
    }
    return this.queue;
  }
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Queue health check timed out.")), milliseconds)),
  ]);
}
