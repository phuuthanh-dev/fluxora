import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { AppModule } from "../app.module";
import { ExecutionService } from "./execution.service";
import { validateEnvironment } from "../platform/environment";
import { executionQueueName, type ExecutionJob } from "./execution-queue.service";
import { resolveWorkerConcurrency } from "./worker-concurrency";

export function createExecutionWorker(connection: IORedis, execute: (job: ExecutionJob) => Promise<void>, queueName = executionQueueName, concurrency = resolveWorkerConcurrency()) {
  return new Worker<ExecutionJob>(queueName, async (job: Job<ExecutionJob>) => execute(job.data), { connection, concurrency });
}

export async function bootstrapExecutionWorker() {
  validateEnvironment();
  process.env.PROCESS_ROLE = "worker";
  const app = await NestFactory.createApplicationContext(AppModule);
  const executions = app.get(ExecutionService);
  const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
  const worker = createExecutionWorker(connection, async (job) => {
    try {
      await executions.run(job.executionId, job.mode, job.startNodeIds, job.debugNodeId);
    } catch (error) {
      await executions.failFromWorker(job.executionId);
      throw error;
    }
  });

  const shutdown = async () => {
    await worker.close();
    await connection.quit();
    await app.close();
  };
  process.once("SIGINT", () => { void shutdown(); });
  process.once("SIGTERM", () => { void shutdown(); });
}

if (require.main === module) void bootstrapExecutionWorker();
