import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { markWorkerJobFailure, registerWorkerShutdown } from "./worker";

test("worker failures only fail an unstarted job or its matching continuation", async () => {
  const calls: unknown[][] = [];
  const executions = {
    failUnstartedFromWorker: async (...args: [string]) => { calls.push(["initial", ...args]); },
    failUnstartedResumeFromWorker: async (...args: [string, string]) => { calls.push(["resume", ...args]); },
  };
  await markWorkerJobFailure(executions, { executionId: "legacy", mode: "live" });
  await markWorkerJobFailure(executions, { executionId: "initial", mode: "live", initialOnly: true });
  await markWorkerJobFailure(executions, { executionId: "continuation", mode: "live", resumeToken: "nonce" });
  assert.deepEqual(calls, [["initial", "legacy"], ["initial", "initial"], ["resume", "continuation", "nonce"]]);
});

test("repeated stop signals initiate only one graceful worker shutdown", async () => {
  const signals = new EventEmitter();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  let failures = 0;
  registerWorkerShutdown(signals, async () => { calls++; await gate; }, () => { failures++; });
  signals.emit("SIGTERM");
  signals.emit("SIGTERM");
  signals.emit("SIGINT");
  assert.equal(calls, 1);
  release();
  await gate;
  assert.equal(failures, 0);
});
