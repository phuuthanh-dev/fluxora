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
