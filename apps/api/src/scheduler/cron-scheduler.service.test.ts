import assert from "node:assert/strict";
import test from "node:test";
import { CronSchedulerService } from "./cron-scheduler.service";

test("cron scheduler creates and dispatches one live execution for a due published workflow", async () => {
  const now = new Date("2026-10-25T10:30:30.000Z");
  const created: Array<{ versionId: string; triggerData: Record<string, unknown>; idempotencyKey: string | undefined }> = [];
  const jobs: Array<{ executionId: string; mode: string }> = [];
  const queries: unknown[] = [];
  const prisma = {
    execution: { findMany: async () => [] },
    workflowVersion: {
      findMany: async (query: unknown) => {
        queries.push(query);
        return [{
        id: "version-1",
        graph: {
          nodes: [{ id: "cron", type: "trigger.cron", position: { x: 0, y: 0 }, config: { expression: "* * * * *", timezone: "Asia/Ho_Chi_Minh" } }, { id: "read", type: "action.supabase.select", nodeVersion: 2, position: { x: 200, y: 0 }, config: { table: "items" } }],
          edges: [],
        },
        }];
      },
    },
  } as never;
  const executions = {
    createCronScheduledExecution: async (versionId: string, triggerData: Record<string, unknown>, idempotencyKey: string | undefined) => {
      created.push({ versionId, triggerData, idempotencyKey });
      return { id: "execution-1" };
    },
  } as never;
  const queue = { dispatch: async (job: { executionId: string; mode: string }) => { jobs.push(job); } } as never;
  const scheduler = new CronSchedulerService(prisma, executions, queue);

  await (scheduler as unknown as { tick: (now: Date) => Promise<void> }).tick(now);
  await (scheduler as unknown as { tick: (now: Date) => Promise<void> }).tick(now);

  assert.deepEqual(queries[0], { where: { status: "PUBLISHED", publishedFor: { is: { isActive: true, archivedAt: null } } } });
  assert.equal(created.length, 1);
  assert.equal(created[0]?.versionId, "version-1");
  assert.equal(typeof created[0]?.triggerData.scheduledAt, "string");
  assert.match(created[0]?.idempotencyKey ?? "", /^cron:version-1:cron:/);
  assert.deepEqual(jobs, [{ executionId: "execution-1", mode: "live", initialOnly: true }]);
});

test("a worker process never starts the cron scheduler", () => {
  const previousRole = process.env.PROCESS_ROLE;
  process.env.PROCESS_ROLE = "worker";
  try {
    const scheduler = new CronSchedulerService({ workflowVersion: { findMany: async () => [] } } as never, {} as never, {} as never);
    scheduler.onModuleInit();
    assert.equal((scheduler as unknown as { timer: NodeJS.Timeout | null }).timer, null);
  } finally {
    if (previousRole === undefined) delete process.env.PROCESS_ROLE;
    else process.env.PROCESS_ROLE = previousRole;
  }
});

test("stopping cron waits for an accepted scan before resolving", async () => {
  const previousRole = process.env.PROCESS_ROLE, previousEnabled = process.env.SCHEDULER_ENABLED;
  delete process.env.PROCESS_ROLE;
  delete process.env.SCHEDULER_ENABLED;
  let started!: () => void, release!: () => void;
  const begun = new Promise<void>((resolve) => { started = resolve; });
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const prisma = { execution: { findMany: async () => [] }, workflowVersion: { findMany: async () => { started(); await pending; return []; } } } as never;
  const scheduler = new CronSchedulerService(prisma, {} as never, {} as never);
  try {
    scheduler.onModuleInit();
    await begun;
    let stopped = false;
    const shutdown = scheduler.onModuleDestroy().then(() => { stopped = true; });
    await Promise.resolve();
    assert.equal(stopped, false);
    release();
    await shutdown;
    assert.equal(stopped, true);
    assert.equal((scheduler as unknown as { timer: NodeJS.Timeout | null }).timer, null);
  } finally {
    release();
    await scheduler.onModuleDestroy();
    if (previousRole === undefined) delete process.env.PROCESS_ROLE; else process.env.PROCESS_ROLE = previousRole;
    if (previousEnabled === undefined) delete process.env.SCHEDULER_ENABLED; else process.env.SCHEDULER_ENABLED = previousEnabled;
  }
});

test("cron keeps only recent dispatch markers while deduplicating the current occurrence", async () => {
  const jobs: unknown[] = [];
  const prisma = {
    execution: { findMany: async () => [] },
    workflowVersion: { findMany: async () => [{ id: "version-1", graph: { nodes: [{ id: "cron", type: "trigger.cron", position: { x: 0, y: 0 }, config: { expression: "* * * * *", timezone: "UTC" } }], edges: [] } }] },
  } as never;
  const executions = { createCronScheduledExecution: async (_version: string, _data: unknown, key: string) => ({ id: key }) } as never;
  const scheduler = new CronSchedulerService(prisma, executions, { dispatch: async (job: unknown) => { jobs.push(job); } } as never);
  const internal = scheduler as unknown as { tick: (now: Date) => Promise<void>; dispatched: Map<string, number> };
  const start = Date.parse("2026-10-25T10:30:30.000Z");
  for (let minute = 0; minute < 6; minute += 1) await internal.tick(new Date(start + minute * 60_000));
  await internal.tick(new Date(start + 5 * 60_000));
  assert.equal(jobs.length, 6);
  assert.equal(internal.dispatched.size, 2);
});

test("a live-readiness failure for one schedule does not stop later cron dispatch", async () => {
  const now = new Date("2026-10-25T10:30:30.000Z");
  const created: string[] = [];
  const prisma = {
    execution: { findMany: async () => [] },
    workflowVersion: {
      findMany: async () => [{
        id: "version-1",
        graph: {
          nodes: [
            { id: "invalid", type: "trigger.cron", position: { x: 0, y: 0 }, config: { expression: "* * * * *", timezone: "Asia/Ho_Chi_Minh" } },
            { id: "valid", type: "trigger.cron", position: { x: 0, y: 0 }, config: { expression: "* * * * *", timezone: "Asia/Ho_Chi_Minh" } },
          ],
          edges: [],
        },
      }],
    },
  } as never;
  const executions = { createCronScheduledExecution: async () => { created.push("attempt"); if (created.length === 1) throw new Error("synthetic-private-provider-detail"); return { id: "execution-2" }; } } as never;
  const jobs: unknown[] = [];
  const scheduler = new CronSchedulerService(prisma, executions, { dispatch: async (job: unknown) => { jobs.push(job); } } as never);
  const errors: unknown[][] = [];
  (scheduler as unknown as { logger: { error: (...args: unknown[]) => void } }).logger.error = (...args) => { errors.push(args); };
  await (scheduler as unknown as { tick: (now: Date) => Promise<void> }).tick(now);
  assert.equal(created.length, 2);
  assert.equal(errors.length, 1);
  assert.ok(!JSON.stringify(errors).includes("synthetic-private-provider-detail"));
  assert.deepEqual(jobs, [{ executionId: "execution-2", mode: "live", initialOnly: true }]);
});

test("a malformed published graph does not prevent another schedule from running", async () => {
  const valid = { id: "valid-version", graph: { nodes: [{ id: "cron", type: "trigger.cron", position: { x: 0, y: 0 }, config: { expression: "* * * * *", timezone: "UTC" } }], edges: [] } };
  const prisma = { execution: { findMany: async () => [] }, workflowVersion: { findMany: async () => [{ id: "invalid-version", graph: { nodes: null, edges: [] } }, valid] } } as never;
  const jobs: unknown[] = [];
  const scheduler = new CronSchedulerService(prisma, { createCronScheduledExecution: async (version: string) => ({ id: version }) } as never, { dispatch: async (job: unknown) => { jobs.push(job); } } as never);
  (scheduler as unknown as { logger: { warn: () => void } }).logger.warn = () => undefined;
  await (scheduler as unknown as { tick: (now: Date) => Promise<void> }).tick(new Date("2026-10-25T10:30:30.000Z"));
  assert.deepEqual(jobs, [{ executionId: "valid-version", mode: "live", initialOnly: true }]);
});

test("a database outage during the cron scan is contained and a later scan can run", async () => {
  let scans = 0;
  const jobs: unknown[] = [];
  const prisma = { execution: { findMany: async () => [] }, workflowVersion: { findMany: async () => {
    if (++scans === 1) throw new Error("synthetic database failure");
    return [{ id: "version-1", graph: { nodes: [{ id: "cron", type: "trigger.cron", position: { x: 0, y: 0 }, config: { expression: "* * * * *", timezone: "UTC" } }], edges: [] } }];
  } } } as never;
  const scheduler = new CronSchedulerService(prisma, { createCronScheduledExecution: async () => ({ id: "run" }) } as never, { dispatch: async (job: unknown) => { jobs.push(job); } } as never);
  const errors: string[] = [];
  (scheduler as unknown as { logger: { error: (message: string) => void } }).logger.error = (message) => { errors.push(message); };
  const tick = (scheduler as unknown as { tick: (now: Date) => Promise<void> }).tick.bind(scheduler);
  const now = new Date("2026-10-25T10:30:30.000Z");
  await tick(now);
  await tick(now);
  assert.equal(errors.length, 1);
  assert.ok(!errors[0]?.includes("synthetic database failure"));
  assert.deepEqual(jobs, [{ executionId: "run", mode: "live", initialOnly: true }]);
});

test("cron recovery requeues only never-started jobs and preserves a bounded scan cursor", async () => {
  const now = new Date("2026-10-25T10:30:30.000Z");
  const queries: Array<{ where: { id?: { gt: string } } }> = [];
  const jobs: unknown[] = [];
  const prisma = { execution: { findMany: async (query: { where: { id?: { gt: string } } }) => { queries.push(query); return queries.length === 1 ? Array.from({ length: 100 }, (_, i) => ({ id: `id-${String(i).padStart(3, "0")}` })) : []; } } } as never;
  const scheduler = new CronSchedulerService(prisma, {} as never, { ensureDispatched: async (job: unknown) => { jobs.push(job); } } as never);
  await scheduler.recoverQueued(now);
  await scheduler.recoverQueued(now);
  assert.deepEqual(queries[0]?.where, { status: "QUEUED", mode: "LIVE", startedAt: null, resumeToken: null, idempotencyKey: { startsWith: "cron:" }, createdAt: { lt: new Date(now.getTime() - 120_000) } });
  assert.deepEqual(queries[1]?.where.id, { gt: "id-099" });
  assert.equal(jobs.length, 100);
  assert.deepEqual(jobs[0], { executionId: "id-000", mode: "live", initialOnly: true });
});

test("a scheduled execution survives a queue outage beyond the cron time window", async () => {
  const due = new Date("2026-10-25T10:30:30.000Z");
  let scan = 0;
  let persisted = false;
  const recovered: unknown[] = [];
  const prisma = {
    execution: { findMany: async () => persisted && scan > 1 ? [{ id: "queued-cron" }] : [] },
    workflowVersion: { findMany: async () => { scan += 1; return scan === 1 ? [{ id: "version-1", graph: { nodes: [{ id: "cron", type: "trigger.cron", position: { x: 0, y: 0 }, config: { expression: "* * * * *", timezone: "UTC" } }], edges: [] } }] : []; } },
  } as never;
  const executions = { createCronScheduledExecution: async () => { persisted = true; return { id: "queued-cron" }; } } as never;
  const queue = { dispatch: async () => { throw new Error("queue offline"); }, ensureDispatched: async (job: unknown) => { recovered.push(job); } } as never;
  const scheduler = new CronSchedulerService(prisma, executions, queue);
  (scheduler as unknown as { logger: { error: () => void } }).logger.error = () => undefined;
  const tick = (date: Date) => (scheduler as unknown as { tick: (date: Date) => Promise<void> }).tick(date);
  await tick(due);
  assert.equal(persisted, true);
  await tick(new Date(due.getTime() + 3 * 60_000));
  await tick(new Date(due.getTime() + 4 * 60_000));
  assert.deepEqual(recovered, [{ executionId: "queued-cron", mode: "live", initialOnly: true }]);
});
