import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { createExecutionWorker } from "./worker";
import type { ExecutionJob } from "./execution-queue.service";

test("Redis queue hands a production execution job to an isolated worker", { skip: process.env.RUN_REDIS_INTEGRATION !== "true" }, async () => {
  const queueName = `workflow-executions-test-${randomUUID()}`;
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const queueConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const workerConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue<ExecutionJob>(queueName, { connection: queueConnection });
  const worker = createExecutionWorker(workerConnection, async () => undefined, queueName);
  try {
    await worker.waitUntilReady();
    const received = new Promise<ExecutionJob>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Worker did not receive execution job.")), 5_000);
      worker.once("completed", (job) => {
        clearTimeout(timer);
        resolve(job.data);
      });
      worker.once("failed", (_, error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    const expected: ExecutionJob = { executionId: randomUUID(), mode: "live", startNodeIds: ["resume-node"] };
    await queue.add("execute", expected, { jobId: expected.executionId });
    assert.deepEqual(await received, expected);
  } finally {
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await queueConnection.quit();
    await workerConnection.quit();
  }
});
