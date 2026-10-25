import assert from "node:assert/strict";
import test from "node:test";
import { CronSchedulerService } from "./cron-scheduler.service";

test("cron scheduler creates and dispatches one live execution for a due published workflow", async () => {
  const now = new Date("2026-10-25T10:30:30.000Z");
  const created: Array<{ versionId: string; triggerData: Record<string, unknown>; idempotencyKey: string | undefined }> = [];
  const jobs: Array<{ executionId: string; mode: string }> = [];
  const queries: unknown[] = [];
  const prisma = {
    workflowVersion: {
      findMany: async (query: unknown) => {
        queries.push(query);
        return [{
        id: "version-1",
        graph: {
          nodes: [{ id: "cron", type: "trigger.cron", position: { x: 0, y: 0 }, config: { expression: "* * * * *", timezone: "Asia/Ho_Chi_Minh" } }],
          edges: [],
        },
        }];
      },
    },
  } as never;
  const executions = {
    createScheduledExecution: async (versionId: string, triggerData: Record<string, unknown>, idempotencyKey: string | undefined) => {
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
  assert.deepEqual(jobs, [{ executionId: "execution-1", mode: "live" }]);
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

test("a live-readiness failure for one schedule does not stop later cron dispatch", async () => {
  const now = new Date("2026-10-25T10:30:30.000Z");
  const created: string[] = [];
  const prisma = {
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
  const executions = { createScheduledExecution: async () => { created.push("attempt"); if (created.length === 1) throw new Error("credential missing"); return { id: "execution-2" }; } } as never;
  const jobs: unknown[] = [];
  const scheduler = new CronSchedulerService(prisma, executions, { dispatch: async (job: unknown) => { jobs.push(job); } } as never);
  (scheduler as unknown as { logger: { error: () => void } }).logger.error = () => undefined;
  await (scheduler as unknown as { tick: (now: Date) => Promise<void> }).tick(now);
  assert.equal(created.length, 2);
  assert.deepEqual(jobs, [{ executionId: "execution-2", mode: "live" }]);
});
