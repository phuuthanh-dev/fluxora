import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { ExecutionService } from "./execution.service";

type QueueMode = "inline" | "redis";
type ExecutionJob = { executionId: string; mode: "mock" | "live" };

@Injectable()
export class ExecutionQueueService implements OnModuleDestroy {
  private readonly mode: QueueMode = process.env.EXECUTION_QUEUE_MODE === "redis" ? "redis" : "inline";
  private connection: IORedis | null = null;
  private queue: Queue<ExecutionJob> | null = null;

  constructor(@Inject(ExecutionService) private readonly executions: ExecutionService) {}

  async dispatch(job: ExecutionJob) {
    if (this.mode === "inline") return this.executions.run(job.executionId, job.mode);
    const queue = this.getQueue();
    await queue.add("execute", job, { jobId: job.executionId, removeOnComplete: 100, removeOnFail: 100 });
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.connection?.quit();
  }

  private getQueue() {
    if (!this.queue) {
      this.connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
      this.queue = new Queue<ExecutionJob>("workflow-executions", { connection: this.connection });
    }
    return this.queue;
  }
}
