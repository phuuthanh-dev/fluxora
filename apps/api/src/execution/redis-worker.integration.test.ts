import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { PrismaService } from "../database/prisma.service";
import { createExecutionWorker } from "./worker";
import { ExecutionQueueService, type ExecutionJob } from "./execution-queue.service";
import { ExecutionService } from "./execution.service";
import { ExecutionEventsService } from "./execution-events.service";

test("Redis queue hands a production execution job to an isolated worker", async () => {
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

test("a worker never exceeds its configured concurrency", async () => {
  const queueName = `workflow-executions-concurrency-${randomUUID()}`;
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const queueConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const workerConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue<ExecutionJob>(queueName, { connection: queueConnection });
  let active = 0;
  let peak = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let signalFirstStart: (() => void) | undefined;
  const firstStarted = new Promise<void>((resolve) => { signalFirstStart = resolve; });
  const worker = createExecutionWorker(workerConnection, async () => {
    active += 1;
    peak = Math.max(peak, active);
    signalFirstStart?.();
    await gate;
    active -= 1;
  }, queueName, 1);
  try {
    await worker.waitUntilReady();
    const completed = new Promise<void>((resolve, reject) => {
      let count = 0;
      const timer = setTimeout(() => reject(new Error("Worker did not complete queued jobs.")), 5_000);
      worker.on("completed", () => {
        count += 1;
        if (count === 2) {
          clearTimeout(timer);
          resolve();
        }
      });
      worker.once("failed", (_, error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    await queue.add("execute", { executionId: randomUUID(), mode: "live" });
    await queue.add("execute", { executionId: randomUUID(), mode: "live" });
    await firstStarted;
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(peak, 1);
    release?.();
    await completed;
    assert.equal(peak, 1);
  } finally {
    release?.();
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await queueConnection.quit();
    await workerConnection.quit();
  }
});

test("Redis-mode dispatch executes a persisted workflow through the real worker service", async () => {
  const previousRole = process.env.PROCESS_ROLE;
  const previousMode = process.env.EXECUTION_QUEUE_MODE;
  const previousQueueName = process.env.EXECUTION_QUEUE_NAME;
  const previousChannel = process.env.EXECUTION_EVENTS_CHANNEL;
  const queueName = `workflow-executions-persisted-${randomUUID()}`;
  process.env.PROCESS_ROLE = "worker";
  process.env.EXECUTION_QUEUE_MODE = "redis";
  process.env.EXECUTION_QUEUE_NAME = queueName;
  process.env.EXECUTION_EVENTS_CHANNEL = `workflow-events-persisted-${randomUUID()}`;
  const workerConnection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
  const cleanupConnection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
  const cleanupQueue = new Queue<ExecutionJob>(queueName, { connection: cleanupConnection });
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const executions = app.get(ExecutionService);
  const queue = app.get(ExecutionQueueService);
  const worker = createExecutionWorker(workerConnection, async (job) => { await executions.run(job.executionId, job.mode, job.startNodeIds); }, queueName);
  const suffix = randomUUID();
  let workspaceId = "";
  let workflowId = "";
  let versionId = "";
  let executionId = "";
  try {
    await worker.waitUntilReady();
    const user = await prisma.user.create({ data: { email: `queue-${suffix}@example.test`, passwordHash: "not-used" } });
    const workspace = await prisma.workspace.create({ data: { name: "Queue integration", slug: `queue-${suffix}`, ownerId: user.id } });
    workspaceId = workspace.id;
    await prisma.workspaceMember.create({ data: { workspaceId, userId: user.id, role: "OWNER" } });
    const workflow = await prisma.workflow.create({ data: { workspaceId, name: "Queued manual execution" } });
    workflowId = workflow.id;
    const version = await prisma.workflowVersion.create({ data: { workflowId, version: 1, status: "PUBLISHED", graph: { nodes: [{ id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} }], edges: [] } } });
    versionId = version.id;
    const execution = await prisma.execution.create({ data: { workflowVersionId: versionId, mode: "MOCK", triggerData: { source: "redis-integration" } } });
    executionId = execution.id;
    await queue.dispatch({ executionId, mode: "mock" });
    await waitForExecution(prisma, executionId, "SUCCEEDED");
    const node = await prisma.nodeExecution.findFirst({ where: { executionId, nodeId: "manual" } });
    assert.equal(node?.status, "SUCCEEDED");
  } finally {
    await worker.close();
    if (executionId) await prisma.execution.deleteMany({ where: { id: executionId } });
    if (versionId) await prisma.workflowVersion.deleteMany({ where: { id: versionId } });
    if (workflowId) await prisma.workflow.deleteMany({ where: { id: workflowId } });
    if (workspaceId) {
      const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } });
      await prisma.workspace.deleteMany({ where: { id: workspaceId } });
      if (workspace) await prisma.user.deleteMany({ where: { id: workspace.ownerId } });
    }
    await app.close();
    await cleanupQueue.obliterate({ force: true });
    await cleanupQueue.close();
    await workerConnection.quit();
    await cleanupConnection.quit();
    if (previousRole === undefined) delete process.env.PROCESS_ROLE;
    else process.env.PROCESS_ROLE = previousRole;
    if (previousMode === undefined) delete process.env.EXECUTION_QUEUE_MODE;
    else process.env.EXECUTION_QUEUE_MODE = previousMode;
    if (previousQueueName === undefined) delete process.env.EXECUTION_QUEUE_NAME;
    else process.env.EXECUTION_QUEUE_NAME = previousQueueName;
    if (previousChannel === undefined) delete process.env.EXECUTION_EVENTS_CHANNEL;
    else process.env.EXECUTION_EVENTS_CHANNEL = previousChannel;
  }
});

test("explicitly retryable BullMQ work waits for backoff before its second attempt", async () => {
  const queueName = `workflow-executions-retry-${randomUUID()}`;
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const queueConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const workerConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue<ExecutionJob>(queueName, { connection: queueConnection });
  let attempts = 0;
  const startedAt = Date.now();
  const worker = createExecutionWorker(workerConnection, async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("retryable test failure");
  }, queueName);
  try {
    await worker.waitUntilReady();
    const completed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Retry job did not complete.")), 5_000);
      worker.once("completed", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    await queue.add("explicit-retry", { executionId: randomUUID(), mode: "mock" }, { attempts: 2, backoff: { type: "fixed", delay: 200 } });
    await completed;
    assert.equal(attempts, 2);
    assert.ok(Date.now() - startedAt >= 150, "The retry must not execute immediately.");
  } finally {
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await queueConnection.quit();
    await workerConnection.quit();
  }
});

test("a graceful worker restart preserves waiting work and disables stalled-job replay", async () => {
  const queueName = `workflow-executions-restart-${randomUUID()}`;
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const queueConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const firstConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const secondConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue<ExecutionJob>(queueName, { connection: queueConnection });
  const firstWorker = createExecutionWorker(firstConnection, async () => undefined, queueName);
  let resolveReceived: ((job: ExecutionJob) => void) | undefined;
  const received = new Promise<ExecutionJob>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Replacement worker did not receive waiting work.")), 5_000);
    resolveReceived = (job) => {
      clearTimeout(timer);
      resolve(job);
    };
  });
  const secondWorker = createExecutionWorker(secondConnection, async (job) => { resolveReceived?.(job); }, queueName);
  try {
    await firstWorker.waitUntilReady();
    assert.equal(firstWorker.opts.maxStalledCount, 0, "Unknown live side effects must never be replayed as a stalled job.");
    await firstWorker.close();
    const expected = { executionId: randomUUID(), mode: "mock" as const };
    await queue.add("execute", expected);
    await secondWorker.waitUntilReady();
    assert.deepEqual(await received, expected);
  } finally {
    await firstWorker.close();
    await secondWorker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await queueConnection.quit();
    await firstConnection.quit();
    await secondConnection.quit();
  }
});

test("production dispatch creates a single-attempt job in an isolated queue", async () => {
  const previousMode = process.env.EXECUTION_QUEUE_MODE;
  const previousQueueName = process.env.EXECUTION_QUEUE_NAME;
  const queueName = `workflow-executions-dispatch-${randomUUID()}`;
  process.env.EXECUTION_QUEUE_MODE = "redis";
  process.env.EXECUTION_QUEUE_NAME = queueName;
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const inspectionConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const inspectionQueue = new Queue<ExecutionJob>(queueName, { connection: inspectionConnection });
  const service = new ExecutionQueueService({} as never);
  const job = { executionId: randomUUID(), mode: "live" as const };
  try {
    await service.dispatch(job);
    const queued = await inspectionQueue.getJob(job.executionId);
    assert.equal(queued?.opts.attempts, 1);
    assert.deepEqual(queued?.data, job);
  } finally {
    await service.onModuleDestroy();
    await inspectionQueue.obliterate({ force: true });
    await inspectionQueue.close();
    await inspectionConnection.quit();
    if (previousMode === undefined) delete process.env.EXECUTION_QUEUE_MODE;
    else process.env.EXECUTION_QUEUE_MODE = previousMode;
    if (previousQueueName === undefined) delete process.env.EXECUTION_QUEUE_NAME;
    else process.env.EXECUTION_QUEUE_NAME = previousQueueName;
  }
});

test("Redis Pub/Sub carries filtered execution events across process service instances", async () => {
  const previousMode = process.env.EXECUTION_QUEUE_MODE;
  const previousChannel = process.env.EXECUTION_EVENTS_CHANNEL;
  process.env.EXECUTION_QUEUE_MODE = "redis";
  process.env.EXECUTION_EVENTS_CHANNEL = `workflow-events-test-${randomUUID()}`;
  const apiEvents = new ExecutionEventsService();
  const workerEvents = new ExecutionEventsService();
  try {
    await Promise.all([apiEvents.onModuleInit(), workerEvents.onModuleInit()]);
    const received = new Promise<{ data: { executionId: string; kind: string } }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Cross-process execution event was not received.")), 5_000);
      const subscription = apiEvents.stream("execution-owned").subscribe((event) => {
        clearTimeout(timer);
        subscription.unsubscribe();
        resolve(event);
      });
    });
    workerEvents.publish("execution-other", "node.updated");
    workerEvents.publish("execution-owned", "execution.succeeded");
    assert.deepEqual(await received, { data: { executionId: "execution-owned", kind: "execution.succeeded" } });
  } finally {
    await Promise.all([apiEvents.onModuleDestroy(), workerEvents.onModuleDestroy()]);
    if (previousMode === undefined) delete process.env.EXECUTION_QUEUE_MODE;
    else process.env.EXECUTION_QUEUE_MODE = previousMode;
    if (previousChannel === undefined) delete process.env.EXECUTION_EVENTS_CHANNEL;
    else process.env.EXECUTION_EVENTS_CHANNEL = previousChannel;
  }
});

async function waitForExecution(prisma: PrismaService, executionId: string, status: "SUCCEEDED") {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const execution = await prisma.execution.findUnique({ where: { id: executionId }, select: { status: true } });
    if (execution?.status === status) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Execution ${executionId} did not reach ${status}.`);
}
