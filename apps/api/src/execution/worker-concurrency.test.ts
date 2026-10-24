import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorkerConcurrency } from "./worker-concurrency";

test("worker concurrency is bounded and defaults to a safe small value", () => {
  assert.equal(resolveWorkerConcurrency(undefined), 2);
  assert.equal(resolveWorkerConcurrency("1"), 1);
  assert.equal(resolveWorkerConcurrency("8"), 8);
  assert.throws(() => resolveWorkerConcurrency("0"), /EXECUTION_WORKER_CONCURRENCY/);
  assert.throws(() => resolveWorkerConcurrency("21"), /EXECUTION_WORKER_CONCURRENCY/);
  assert.throws(() => resolveWorkerConcurrency("parallel"), /EXECUTION_WORKER_CONCURRENCY/);
});
