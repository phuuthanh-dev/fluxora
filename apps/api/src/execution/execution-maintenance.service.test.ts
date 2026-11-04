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
    { failFromMaintenance: async (id: string, code: string, message: string, before: Date) => { calls.push({ id, code, message, before }); return true; } } as never,
  );
  const recovered = await service.failExpiredLeases(now);
  assert.equal(recovered, 2);
  assert.deepEqual(calls.map((call) => call.id), ["expired-1", "expired-2"]);
  assert.ok(calls.every((call) => call.code === "EXECUTION_LEASE_EXPIRED" && call.before === now));
});

test("one failed lease recovery does not prevent later executions from being recovered", async () => {
  const visited: string[] = [];
  const warnings: string[] = [];
  const service = new ExecutionMaintenanceService(
    { execution: { findMany: async () => [{ id: "failed" }, { id: "claimed-elsewhere" }, { id: "recovered" }] } } as never,
    { failFromMaintenance: async (id: string) => { visited.push(id); if (id === "failed") throw new Error("synthetic-private-detail"); return id === "recovered"; } } as never,
  );
  (service as unknown as { logger: { warn: (message: string) => void } }).logger.warn = (message) => { warnings.push(message); };
  assert.equal(await service.failExpiredLeases(), 1);
  assert.deepEqual(visited, ["failed", "claimed-elsewhere", "recovered"]);
  assert.equal(warnings.length, 1);
  assert.ok(!warnings[0]?.includes("synthetic-private-detail"));
});

test("approval maintenance isolates failures and continues the bounded scan", async () => {
  const visited: string[] = [];
  const warnings: string[] = [];
  const service = new ExecutionMaintenanceService(
    { approvalRequest: { findMany: async () => [{ id: "bad", executionId: "run-1" }, { id: "due", executionId: "run-2" }] } } as never,
    { expireApprovalFromMaintenance: async (id: string) => { visited.push(id); if (id === "bad") throw new Error("synthetic-private-detail"); return true; } } as never,
  );
  (service as unknown as { logger: { warn: (message: string) => void } }).logger.warn = (message) => { warnings.push(message); };
  assert.equal(await service.expireApprovals(), 1);
  assert.deepEqual(visited, ["bad", "due"]);
  assert.equal(warnings.length, 1);
  assert.ok(!warnings[0]?.includes("synthetic-private-detail"));
});

test("a full batch of failed lease recoveries cannot starve later expired executions", async () => {
  const queries: Array<{ where: { id?: { gt: string } } }> = [];
  const service = new ExecutionMaintenanceService(
    { execution: { findMany: async (query: { where: { id?: { gt: string } } }) => {
      queries.push(query);
      return queries.length === 1 ? Array.from({ length: 100 }, (_, index) => ({ id: `id-${String(index).padStart(3, "0")}` })) : [];
    } } } as never,
    { failFromMaintenance: async () => { throw new Error("synthetic failure"); } } as never,
  );
  (service as unknown as { logger: { warn: () => void } }).logger.warn = () => undefined;
  assert.equal(await service.failExpiredLeases(), 0);
  assert.equal(await service.failExpiredLeases(), 0);
  assert.equal(await service.failExpiredLeases(), 0);
  assert.equal(queries[0]?.where.id, undefined);
  assert.deepEqual(queries[1]?.where.id, { gt: "id-099" });
  assert.equal(queries[2]?.where.id, undefined);
});

test("a second lease scan does not overlap one already in progress", async () => {
  let unblock: (() => void) | undefined;
  const wait = new Promise<void>((resolve) => { unblock = resolve; });
  let scans = 0;
  const service = new ExecutionMaintenanceService(
    { execution: { findMany: async () => { scans++; await wait; return [{ id: "expired" }]; } } } as never,
    { failFromMaintenance: async () => true } as never,
  );
  const first = service.failExpiredLeases();
  assert.equal(await service.failExpiredLeases(), 0);
  unblock!();
  assert.equal(await first, 1);
  assert.equal(scans, 1);
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
