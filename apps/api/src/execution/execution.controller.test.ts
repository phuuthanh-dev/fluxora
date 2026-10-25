import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { ExecutionController } from "./execution.controller";

test("manual live execution requires an explicit API confirmation", async () => {
  const executions = { createManualExecution: async () => { throw new Error("should not create execution"); } };
  const controller = new ExecutionController(executions as never, {} as never, {} as never);
  await assert.rejects(
    () => controller.startManual("workflow-1", { body: { mock: false }, currentUser: { id: "user-1" } } as never),
    (error: unknown) => error instanceof BadRequestException && (error.getResponse() as { code: string }).code === "LIVE_CONFIRMATION_REQUIRED",
  );
});

test("confirmed live execution reaches the pinned-version service and queue", async () => {
  const calls: unknown[] = [];
  const executions = {
    createManualExecution: async (...args: unknown[]) => { calls.push(args); return { id: "execution-1" }; },
    get: async () => ({ id: "execution-1", status: "QUEUED" }),
  };
  const queued: unknown[] = [];
  const controller = new ExecutionController(executions as never, { dispatch: async (job: unknown) => { queued.push(job); } } as never, {} as never);
  const result = await controller.startManual("workflow-1", { body: { mock: false, confirmLive: true, triggerData: { source: "test" } }, currentUser: { id: "user-1" } } as never);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["workflow-1", "user-1", false, { source: "test" }]);
  assert.deepEqual(queued, [{ executionId: "execution-1", mode: "live" }]);
  assert.deepEqual(result, { execution: { id: "execution-1", status: "QUEUED" } });
});

test("workspace execution list is owner-scoped", async () => {
  const controller = new ExecutionController({ listForWorkspace: async (...args: unknown[]) => [{ id: "execution-1", args }] } as never, {} as never, {} as never);
  const result = await controller.listForWorkspace("workspace-1", { currentUser: { id: "user-1" } } as never);
  assert.deepEqual(result, { executions: [{ id: "execution-1", args: ["workspace-1", "user-1"] }] });
});

test("live readiness is exposed without starting an execution", async () => {
  const calls: unknown[] = [];
  const executions = {
    getLiveReadiness: async (...args: unknown[]) => { calls.push(args); return { ready: false, requirements: [{ nodeId: "steam", provider: "STEAM", credentialId: null, ready: false, reason: "MISSING_CREDENTIAL" }] }; },
  };
  const controller = new ExecutionController(executions as never, {} as never, {} as never);
  const result = await controller.liveReadiness("workflow-1", { currentUser: { id: "user-1" } } as never);
  assert.deepEqual(calls, [["workflow-1", "user-1"]]);
  assert.deepEqual(result, { readiness: { ready: false, requirements: [{ nodeId: "steam", provider: "STEAM", credentialId: null, ready: false, reason: "MISSING_CREDENTIAL" }] } });
});
