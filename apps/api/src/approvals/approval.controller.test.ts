import assert from "node:assert/strict";
import test from "node:test";
import { ApprovalController } from "./approval.controller";

test("a dispatch failure does not report an already saved approval as failed", async () => {
  const executions = { resolveApproval: async () => ({ executionId: "run", resumed: true, startNodeIds: ["next"], mode: "live", resumeToken: "synthetic-phase" }) };
  let job: unknown;
  const queue = { ensureDispatched: async (value: unknown) => { job = value; throw new Error("Redis acknowledgement lost"); } };
  const controller = new ApprovalController(executions as never, queue as never);
  const result = await controller.resolve("approval", { currentUser: { id: "owner" }, body: { decision: "approved" } } as never);
  assert.deepEqual(job, { executionId: "run", mode: "live", resumeToken: "synthetic-phase" });
  assert.deepEqual(result.approval, { id: "approval", decision: "approved", executionId: "run", resumed: true, dispatchStatus: "unconfirmed" });
  assert.ok(!JSON.stringify(result).includes("synthetic-phase"));
});
