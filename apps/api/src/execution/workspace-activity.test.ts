import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionService } from "./execution.service";

test("activity counts all retained statuses in a bounded owner-scoped workspace window", async () => {
  let authorized = false;
  let query: { by: string[]; where: { workflowVersion: unknown; createdAt: { gte: Date; lte: Date } } } | undefined;
  const db = {
    workspaceMember: { findUnique: async (input: unknown) => { assert.deepEqual(input, { where: { workspaceId_userId: { workspaceId: "workspace-a", userId: "owner-a" } } }); authorized = true; return { role: "OWNER" }; } },
    execution: { groupBy: async (input: typeof query) => { assert.equal(authorized, true); query = input; return [{ status: "SUCCEEDED", _count: { _all: 24 } }, { status: "FAILED", _count: { _all: 2 } }, { status: "CANCELLED", _count: { _all: 1 } }]; } },
  };
  const activity = await new ExecutionService(db as never, {} as never, {} as never).activityForWorkspace("workspace-a", "owner-a");
  assert.ok(query);
  assert.deepEqual(query.by, ["status"]);
  assert.deepEqual(query.where.workflowVersion, { workflow: { workspaceId: "workspace-a" } });
  assert.equal(query.where.createdAt.gte.getTime(), activity.asOf.getTime() - 24 * 60 * 60 * 1000);
  assert.equal(query.where.createdAt.lte.getTime(), activity.asOf.getTime());
  assert.equal(activity.total, 27);
  assert.deepEqual(activity.counts, { QUEUED: 0, RUNNING: 0, WAITING_APPROVAL: 0, SUCCEEDED: 24, FAILED: 2, CANCELLED: 1 });
});

test("activity refuses non-owners before querying executions", async () => {
  let queried = false;
  const db = { workspaceMember: { findUnique: async () => ({ role: "VIEWER" }) }, execution: { groupBy: async () => { queried = true; return []; } } };
  await assert.rejects(new ExecutionService(db as never, {} as never, {} as never).activityForWorkspace("workspace-b", "not-owner"));
  assert.equal(queried, false);
});
