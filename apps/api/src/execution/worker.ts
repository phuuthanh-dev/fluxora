import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { AppModule } from "../app.module";
import { ExecutionService } from "./execution.service";
import { validateEnvironment } from "../platform/environment";
import { resolveExecutionQueueName } from "./execution-queue.config";
import { type ExecutionJob } from "./execution-queue.service";
import { resolveWorkerConcurrency } from "./worker-concurrency";

export function createExecutionWorker(connection: IORedis, execute: (job: ExecutionJob) => Promise<void>, queueName = resolveExecutionQueueName(), concurrency = resolveWorkerConcurrency(), workerOptions: { lockDuration?: number; stalledInterval?: number } = {}) {
  return new Worker<ExecutionJob>(queueName, async (job: Job<ExecutionJob>) => execute(job.data), {
    connection,
    concurrency,
    // A stalled live execution may already have changed an external provider.
    // Never replay it automatically; lease maintenance records a terminal failure.
    maxStalledCount: 0,
    ...workerOptions,
  });
}

/** A failed queue job cannot prove ownership of a currently running phase. */
export async function markWorkerJobFailure(executions: Pick<ExecutionService, "failUnstartedResumeFromWorker" | "failUnstartedFromWorker">, job: ExecutionJob) {
  if (job.resumeToken) await executions.failUnstartedResumeFromWorker(job.executionId, job.resumeToken);
  else await executions.failUnstartedFromWorker(job.executionId);
}

/** Repeated stop signals must not terminate an active graceful drain. */
export function registerWorkerShutdown(signals: { on(event: "SIGINT" | "SIGTERM", listener: () => void): unknown }, shutdown: () => Promise<void>, onFailure: () => void) {
  let started = false;
  const requestShutdown = () => {
    if (started) return;
    started = true;
    void shutdown().catch(onFailure);
  };
  signals.on("SIGINT", requestShutdown);
  signals.on("SIGTERM", requestShutdown);
}

export async function bootstrapExecutionWorker() {
  validateEnvironment();
  process.env.PROCESS_ROLE = "worker";
  const app = await NestFactory.createApplicationContext(AppModule);
  const executions = app.get(ExecutionService);
  const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
  const worker = createExecutionWorker(connection, async (job) => {
    try {
      await executions.run(job.executionId, job.mode, job.startNodeIds, job.debugNodeId, job.initialOnly, job.resumeToken);
    } catch (error) {
      await markWorkerJobFailure(executions, job);
      throw error;
    }
  });

  const shutdown = async () => {
    await worker.close();
    await connection.quit();
    await app.close();
  };
  registerWorkerShutdown(process, shutdown, () => { console.error("Worker shutdown did not complete; inspect the queue before restarting."); process.exitCode = 1; });
}

if (require.main === module) void bootstrapExecutionWorker();
