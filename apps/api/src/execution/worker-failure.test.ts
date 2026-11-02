import assert from "node:assert/strict";
import test from "node:test";
import { markWorkerJobFailure } from "./worker";

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
