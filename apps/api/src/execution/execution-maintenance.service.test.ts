import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionMaintenanceService, executionRetentionPolicy } from "./execution-maintenance.service";

test("execution retention policy uses bounded defaults and ignores invalid values", () => {
  assert.deepEqual(executionRetentionPolicy({}), { successDays: 14, failedDays: 30, maxCount: 10_000 });
  assert.deepEqual(executionRetentionPolicy({ EXECUTION_RETENTION_SUCCESS_DAYS: "7", EXECUTION_RETENTION_FAILED_DAYS: "45", EXECUTION_RETENTION_MAX_COUNT: "500" }), { successDays: 7, failedDays: 45, maxCount: 500 });
  assert.deepEqual(executionRetentionPolicy({ EXECUTION_RETENTION_SUCCESS_DAYS: "0", EXECUTION_RETENTION_FAILED_DAYS: "invalid", EXECUTION_RETENTION_MAX_COUNT: "-1" }), { successDays: 14, failedDays: 30, maxCount: 10_000 });
});

test("maintenance marks every expired running execution with a lease failure", async () => {
  const calls: Array<{ id: string; code: string; message: string; before: Date }> = [];
  const now = new Date("2026-10-25T00:00:00.000Z");
  const service = new ExecutionMaintenanceService(
    { execution: { findMany: async () => [{ id: "expired-1" }, { id: "expired-2" }] } } as never,
    { failFromMaintenance: async (id: string, code: string, message: string, before: Date) => { calls.push({ id, code, message, before }); } } as never,
  );
  const recovered = await service.failExpiredLeases(now);
  assert.equal(recovered, 2);
  assert.deepEqual(calls.map((call) => call.id), ["expired-1", "expired-2"]);
  assert.ok(calls.every((call) => call.code === "EXECUTION_LEASE_EXPIRED" && call.before === now));
});

test("pruning removes old terminal executions and applies a terminal-count ceiling", async () => {
  const deleted: unknown[] = [];
  const previousMaxCount = process.env.EXECUTION_RETENTION_MAX_COUNT;
  process.env.EXECUTION_RETENTION_MAX_COUNT = "2";
  try {
    const service = new ExecutionMaintenanceService(
      {
        execution: {
          deleteMany: async (query: unknown) => { deleted.push(query); return { count: deleted.length === 1 ? 3 : 2 }; },
          findMany: async () => [{ id: "old-1" }, { id: "old-2" }],
        },
      } as never,
      {} as never,
    );
    const pruned = await service.pruneFinished(new Date("2026-10-25T00:00:00.000Z"));
    assert.equal(pruned, 5);
    assert.equal(deleted.length, 2);
    assert.deepEqual((deleted[1] as { where: { id: { in: string[] } } }).where.id.in, ["old-1", "old-2"]);
  } finally {
    if (previousMaxCount === undefined) delete process.env.EXECUTION_RETENTION_MAX_COUNT;
    else process.env.EXECUTION_RETENTION_MAX_COUNT = previousMaxCount;
  }
});
