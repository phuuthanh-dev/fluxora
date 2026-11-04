import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { PrismaService } from "../database/prisma.service";
import { createExecutionWorker } from "./worker";
import { ExecutionQueueService, type ExecutionJob } from "./execution-queue.service";
import { ExecutionService } from "./execution.service";
import { ExecutionEventsService } from "./execution-events.service";
import { CronSchedulerService } from "../scheduler/cron-scheduler.service";

test("cron recovery dispatches an accepted, never-started job once through Redis", async () => {
  const dbUrl = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(dbUrl.hostname) || !/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(dbUrl.pathname)) throw new Error("Cron recovery test requires a disposable local fluxora_*test* database.");
  const previousRole = process.env.PROCESS_ROLE;
  const previousMode = process.env.EXECUTION_QUEUE_MODE;
  const previousQueueName = process.env.EXECUTION_QUEUE_NAME;
  const previousChannel = process.env.EXECUTION_EVENTS_CHANNEL;
  const queueName = `cron-recovery-${randomUUID()}`;
  process.env.PROCESS_ROLE = "worker";
  process.env.EXECUTION_QUEUE_MODE = "redis";
  process.env.EXECUTION_QUEUE_NAME = queueName;
  process.env.EXECUTION_EVENTS_CHANNEL = `cron-recovery-events-${randomUUID()}`;
  const workerConnection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
  const cleanupConnection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
  const cleanupQueue = new Queue<ExecutionJob>(queueName, { connection: cleanupConnection });
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService), executions = app.get(ExecutionService), queue = app.get(ExecutionQueueService);
  const suffix = randomUUID();
  let userId = "", workspaceId = "", workflowId = "", versionId = "";
  const worker = createExecutionWorker(workerConnection, async (job) => { await executions.run(job.executionId, job.mode, job.startNodeIds, job.debugNodeId, job.initialOnly, job.resumeToken); }, queueName);
  await worker.pause();
  try {
    const user = await prisma.user.create({ data: { email: `cron-${suffix}@example.test`, passwordHash: "not-used" } }); userId = user.id;
    const workspace = await prisma.workspace.create({ data: { name: "Cron recovery", slug: `cron-${suffix}`, ownerId: userId } }); workspaceId = workspace.id;
    await prisma.workspaceMember.create({ data: { workspaceId, userId, role: "OWNER" } });
    const workflow = await prisma.workflow.create({ data: { workspaceId, name: "Cron recovery" } }); workflowId = workflow.id;
    const version = await prisma.workflowVersion.create({ data: { workflowId, version: 1, status: "PUBLISHED", graph: { nodes: [{ id: "cron", type: "trigger.cron", position: { x: 0, y: 0 }, config: { expression: "* * * * *", timezone: "UTC" } }], edges: [] } } }); versionId = version.id;
    const old = new Date(Date.now() - 180_000);
    const queued = await prisma.execution.create({ data: { workflowVersionId: versionId, mode: "LIVE", idempotencyKey: `cron:${suffix}:queued`, createdAt: old } });
    const started = await prisma.execution.create({ data: { workflowVersionId: versionId, mode: "LIVE", idempotencyKey: `cron:${suffix}:started`, createdAt: old, startedAt: old } });
    const recent = await prisma.execution.create({ data: { workflowVersionId: versionId, mode: "LIVE", idempotencyKey: `cron:${suffix}:recent` } });
    // Scope this test's scan to its own workflow; the real Prisma query still
    // exercises the production filters without touching other test fixtures.
    const scoped = { execution: { findMany: (query: Parameters<typeof prisma.execution.findMany>[0]) => prisma.execution.findMany({ ...query, where: { ...query?.where, workflowVersionId: versionId } }) } } as unknown as PrismaService;
    const scheduler = new CronSchedulerService(scoped, executions, queue);
    await scheduler.recoverQueued();
    await scheduler.recoverQueued();
    const jobs = await cleanupQueue.getJobs(["wait", "active", "delayed"]);
    assert.equal(jobs.length, 1);
    assert.deepEqual(jobs[0]?.data, { executionId: queued.id, mode: "live", initialOnly: true });
    await worker.resume();
    await waitForExecution(prisma, queued.id, "SUCCEEDED");
    assert.equal((await prisma.execution.findUniqueOrThrow({ where: { id: started.id } })).status, "QUEUED");
    assert.equal((await prisma.execution.findUniqueOrThrow({ where: { id: recent.id } })).status, "QUEUED");
  } finally {
    await worker.close();
    if (versionId) await prisma.execution.deleteMany({ where: { workflowVersionId: versionId } });
    if (versionId) await prisma.workflowVersion.deleteMany({ where: { id: versionId } });
    if (workflowId) await prisma.workflow.deleteMany({ where: { id: workflowId } });
    if (workspaceId) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
    await cleanupQueue.obliterate({ force: true }); await cleanupQueue.close();
    await workerConnection.quit(); await cleanupConnection.quit();
    if (previousRole === undefined) delete process.env.PROCESS_ROLE; else process.env.PROCESS_ROLE = previousRole;
    if (previousMode === undefined) delete process.env.EXECUTION_QUEUE_MODE; else process.env.EXECUTION_QUEUE_MODE = previousMode;
    if (previousQueueName === undefined) delete process.env.EXECUTION_QUEUE_NAME; else process.env.EXECUTION_QUEUE_NAME = previousQueueName;
    if (previousChannel === undefined) delete process.env.EXECUTION_EVENTS_CHANNEL; else process.env.EXECUTION_EVENTS_CHANNEL = previousChannel;
  }
});

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

test("worker drain finishes active work and leaves later jobs for its replacement", { timeout: 15_000 }, async () => {
  const queueName = `workflow-executions-drain-${randomUUID()}`;
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const queueConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const firstConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const secondConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue<ExecutionJob>(queueName, { connection: queueConnection });
  let release!: () => void;
  let signalStarted!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { signalStarted = resolve; });
  const firstWorker = createExecutionWorker(firstConnection, async () => { signalStarted(); await gate; }, queueName, 1);
  let secondWorker: ReturnType<typeof createExecutionWorker> | undefined;
  try {
    await firstWorker.waitUntilReady();
    await queue.add("execute", { executionId: randomUUID(), mode: "mock" });
    await started;
    let closed = false;
    const closing = firstWorker.close().then(() => { closed = true; });
    const waiting = { executionId: randomUUID(), mode: "mock" as const };
    await queue.add("execute", waiting);
    assert.equal(closed, false);
    release();
    await closing;
    assert.equal((await queue.getJobCounts("wait")).wait, 1);
    const received = new Promise<ExecutionJob>((resolve) => {
      secondWorker = createExecutionWorker(secondConnection, async (job) => { resolve(job); }, queueName, 1);
    });
    assert.deepEqual(await received, waiting);
  } finally {
    release();
    await firstWorker.close();
    await secondWorker?.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await queueConnection.quit();
    await firstConnection.quit();
    await secondConnection.quit();
  }
});

test("repeated real stop signals do not interrupt an active worker drain", { timeout: 20_000 }, async () => {
  const queueName = `workflow-executions-signals-${randomUUID()}`;
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
  const queueConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue<ExecutionJob>(queueName, { connection: queueConnection });
  const source = `
    const IORedis = require('ioredis');
    const { createExecutionWorker, registerWorkerShutdown } = require('./src/execution/worker.ts');
    const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    const worker = createExecutionWorker(connection, async () => {
      process.stdout.write('JOB_STARTED\\n');
      await new Promise(resolve => process.stdin.once('data', resolve));
    }, process.env.TEST_QUEUE, 1);
    registerWorkerShutdown(process, async () => {
      process.stdout.write('DRAINING\\n');
      await worker.close();
      await connection.quit();
      process.stdin.pause();
    }, () => { process.exitCode = 1; });
    worker.waitUntilReady().then(() => process.stdout.write('READY\\n'));
  `;
  const child = spawn(process.execPath, ["--import", "tsx", "-e", source], {
    cwd: resolve(__dirname, "../.."),
    env: { ...process.env, REDIS_URL: redisUrl, TEST_QUEUE: queueName, TSX_TSCONFIG_PATH: resolve(__dirname, "../../tsconfig.json") },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  let errors = "";
  child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk: Buffer) => { errors += chunk.toString(); });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolveExit({ code, signal }));
  });
  async function waitFor(text: string) {
    const deadline = Date.now() + 8_000;
    while (!output.includes(text)) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Test worker exited before ${text}: ${errors.slice(-3000)}`);
      if (Date.now() >= deadline) throw new Error(`Test worker did not report ${text}: ${errors.slice(-3000)}`);
      await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    }
  }
  let replacement: ReturnType<typeof createExecutionWorker> | undefined;
  let replacementConnection: IORedis | undefined;
  try {
    await waitFor("READY");
    await queue.add("execute", { executionId: randomUUID(), mode: "mock" });
    await waitFor("JOB_STARTED");
    child.kill("SIGTERM");
    await waitFor("DRAINING");
    child.kill("SIGTERM");
    const waiting = { executionId: randomUUID(), mode: "mock" as const };
    await queue.add("execute", waiting);
    child.stdin.end("finish\n");
    assert.deepEqual(await exited, { code: 0, signal: null });
    assert.equal((await queue.getJobCounts("wait")).wait, 1);
    replacementConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    const received = new Promise<ExecutionJob>((resolveJob) => {
      replacement = createExecutionWorker(replacementConnection!, async (job) => { resolveJob(job); }, queueName, 1);
    });
    assert.deepEqual(await received, waiting);
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await exited; }
    await replacement?.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await queueConnection.quit();
    await replacementConnection?.quit();
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
    await service.onApplicationShutdown();
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
    apiEvents.onModuleDestroy(); workerEvents.onModuleDestroy();
    await Promise.all([apiEvents.onApplicationShutdown(), workerEvents.onApplicationShutdown()]);
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
