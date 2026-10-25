import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { WorkflowController } from "./workflow.controller";

test("workflow activation requires live readiness before enabling triggers", async () => {
  const calls: unknown[] = [];
  const controller = new WorkflowController(
    { activate: async (...args: unknown[]) => { calls.push(args); return { id: "workflow-1", isActive: true }; } } as never,
    { getLiveReadiness: async () => ({ ready: true, requirements: [] }) } as never,
  );

  const result = await controller.activate("workflow-1", { currentUser: { id: "user-1" } } as never);

  assert.deepEqual(calls, [["workflow-1", "user-1"]]);
  assert.deepEqual(result, { workflow: { id: "workflow-1", isActive: true } });
});

test("workflow activation rejects missing live credentials", async () => {
  const controller = new WorkflowController(
    { activate: async () => { throw new Error("should not activate"); } } as never,
    { getLiveReadiness: async () => ({ ready: false, requirements: [{ nodeId: "telegram", ready: false }] }) } as never,
  );

  await assert.rejects(
    () => controller.activate("workflow-1", { currentUser: { id: "user-1" } } as never),
    (error: unknown) => error instanceof BadRequestException && (error.getResponse() as { code: string }).code === "LIVE_CREDENTIAL_REQUIRED",
  );
});
