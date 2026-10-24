import assert from "node:assert/strict";
import test from "node:test";
import { CronSchedulerService } from "./cron-scheduler.service";

test("cron scheduler creates and dispatches one live execution for a due published workflow", async () => {
  const created: Array<{ versionId: string; triggerData: Record<string, unknown> }> = [];
  const jobs: Array<{ executionId: string; mode: string }> = [];
  const prisma = {
    workflowVersion: {
      findMany: async () => [{
        id: "version-1",
        graph: {
          nodes: [{ id: "cron", type: "trigger.cron", position: { x: 0, y: 0 }, config: { expression: "* * * * *", timezone: "Asia/Ho_Chi_Minh" } }],
          edges: [],
        },
      }],
    },
  } as never;
  const executions = {
    createScheduledExecution: async (versionId: string, triggerData: Record<string, unknown>) => {
      created.push({ versionId, triggerData });
      return { id: "execution-1" };
    },
  } as never;
  const queue = { dispatch: async (job: { executionId: string; mode: string }) => { jobs.push(job); } } as never;
  const scheduler = new CronSchedulerService(prisma, executions, queue);

  await (scheduler as unknown as { tick: () => Promise<void> }).tick();
  await (scheduler as unknown as { tick: () => Promise<void> }).tick();

  assert.equal(created.length, 1);
  assert.equal(created[0]?.versionId, "version-1");
  assert.equal(typeof created[0]?.triggerData.scheduledAt, "string");
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
  await (scheduler as unknown as { tick: () => Promise<void> }).tick();
  assert.equal(created.length, 2);
  assert.deepEqual(jobs, [{ executionId: "execution-2", mode: "live" }]);
});
