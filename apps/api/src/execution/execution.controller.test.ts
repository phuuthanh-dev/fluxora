import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { of } from "rxjs";
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

test("node debug is always queued as a mock run for only the selected node", async () => {
  const calls: unknown[] = [];
  const queued: unknown[] = [];
  const executions = {
    createManualExecution: async (...args: unknown[]) => { calls.push(args); return { id: "execution-debug-1" }; },
    get: async () => ({ id: "execution-debug-1", status: "SUCCEEDED" }),
  };
  const controller = new ExecutionController(executions as never, { dispatch: async (job: unknown) => { queued.push(job); } } as never, {} as never);

  const result = await controller.startManual("workflow-1", { body: { mock: true, nodeId: "steam", triggerData: { source: "debug" } }, currentUser: { id: "user-1" } } as never);

  assert.deepEqual(calls, [["workflow-1", "user-1", true, { source: "debug" }, "steam"]]);
  assert.deepEqual(queued, [{ executionId: "execution-debug-1", mode: "mock", debugNodeId: "steam" }]);
  assert.deepEqual(result, { execution: { id: "execution-debug-1", status: "SUCCEEDED" } });
});

test("retry dispatches the same safe mode and requires a fresh confirmation for live providers", async () => {
  const queued: unknown[] = [];
  const executions = {
    get: async (id: string) => id === "live-source" || id === "retry-live-source"
      ? { id, mode: "live" }
      : { id, mode: "mock" },
    retry: async (id: string) => ({ id: `retry-${id}`, mode: id === "live-source" ? "LIVE" : "MOCK" }),
  };
  const controller = new ExecutionController(executions as never, { dispatch: async (job: unknown) => { queued.push(job); } } as never, {} as never);

  await assert.rejects(
    () => controller.retry("live-source", { body: {}, currentUser: { id: "user-1" } } as never),
    (error: unknown) => error instanceof BadRequestException && (error.getResponse() as { code: string }).code === "LIVE_RETRY_CONFIRMATION_REQUIRED",
  );

  const mockResult = await controller.retry("mock-source", { body: {}, currentUser: { id: "user-1" } } as never);
  assert.deepEqual(mockResult, { execution: { id: "retry-mock-source", mode: "mock" } });
  const liveResult = await controller.retry("live-source", { body: { confirmLive: true }, currentUser: { id: "user-1" } } as never);
  assert.deepEqual(liveResult, { execution: { id: "retry-live-source", mode: "live" } });
  assert.deepEqual(queued, [
    { executionId: "retry-mock-source", mode: "mock" },
    { executionId: "retry-live-source", mode: "live" },
  ]);
});

test("workspace execution list is owner-scoped", async () => {
  const controller = new ExecutionController({ listForWorkspace: async (...args: unknown[]) => ({ executions: [{ id: "execution-1", args }], nextCursor: "execution-1" }) } as never, {} as never, {} as never);
  const result = await controller.listForWorkspace("workspace-1", "cursor-1", "10", { currentUser: { id: "user-1" } } as never);
  assert.deepEqual(result, { executions: [{ id: "execution-1", args: ["workspace-1", "user-1", 10, "cursor-1"] }], nextCursor: "execution-1" });
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

test("execution SSE authorizes the owner before opening the event stream", async () => {
  const calls: unknown[] = [];
  const stream = of({ data: { executionId: "execution-1", kind: "execution.running" } });
  const controller = new ExecutionController(
    { get: async (...args: unknown[]) => { calls.push(args); return { id: "execution-1" }; } } as never,
    {} as never,
    { stream: (executionId: string) => { calls.push(["stream", executionId]); return stream; } } as never,
  );
  const observable = controller.eventsForExecution("execution-1", { currentUser: { id: "owner-1" } } as never);
  await new Promise<void>((resolve, reject) => observable.subscribe({ next: () => resolve(), error: reject }));
  assert.deepEqual(calls, [["execution-1", "owner-1"], ["stream", "execution-1"]]);
});

test("execution SSE never opens a stream when owner authorization fails", async () => {
  let streamOpened = false;
  const controller = new ExecutionController(
    { get: async () => { throw new Error("not found for this owner"); } } as never,
    {} as never,
    { stream: () => { streamOpened = true; return { subscribe: () => undefined }; } } as never,
  );
  const observable = controller.eventsForExecution("execution-foreign", { currentUser: { id: "owner-1" } } as never);
  await assert.rejects(() => new Promise<void>((resolve, reject) => observable.subscribe({ next: () => resolve(), error: reject })), /not found/);
  assert.equal(streamOpened, false);
});

test("diagnostic download remains owner-scoped", async () => {
  const calls: unknown[] = [];
  const controller = new ExecutionController(
    { getDiagnostic: async (...args: unknown[]) => { calls.push(args); return { schemaVersion: "fluxora.execution-diagnostic.v1" }; } } as never,
    {} as never,
    {} as never,
  );
  const result = await controller.diagnostic("execution-1", { currentUser: { id: "owner-1" } } as never);
  assert.deepEqual(calls, [["execution-1", "owner-1"]]);
  assert.deepEqual(result, { diagnostic: { schemaVersion: "fluxora.execution-diagnostic.v1" } });
});
