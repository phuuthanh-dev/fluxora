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

test("a worker never exceeds its configured concurrency", { skip: process.env.RUN_REDIS_INTEGRATION !== "true" }, async () => {
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

test("Redis-mode dispatch executes a persisted workflow through the real worker service", { skip: process.env.RUN_REDIS_INTEGRATION !== "true" }, async () => {
  const previousRole = process.env.PROCESS_ROLE;
  const previousMode = process.env.EXECUTION_QUEUE_MODE;
  process.env.PROCESS_ROLE = "worker";
  process.env.EXECUTION_QUEUE_MODE = "redis";
  const workerConnection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const executions = app.get(ExecutionService);
  const queue = app.get(ExecutionQueueService);
  const worker = createExecutionWorker(workerConnection, async (job) => { await executions.run(job.executionId, job.mode, job.startNodeIds); });
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
    await workerConnection.quit();
    await app.close();
    if (previousRole === undefined) delete process.env.PROCESS_ROLE;
    else process.env.PROCESS_ROLE = previousRole;
    if (previousMode === undefined) delete process.env.EXECUTION_QUEUE_MODE;
    else process.env.EXECUTION_QUEUE_MODE = previousMode;
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
