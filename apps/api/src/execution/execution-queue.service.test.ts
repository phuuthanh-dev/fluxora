import assert from "node:assert/strict";
import test from "node:test";
import { resolveQueueMode } from "./execution-queue.config";

test("execution queue mode is explicit and never silently falls back", () => {
  assert.equal(resolveQueueMode(undefined), "inline");
  assert.equal(resolveQueueMode("inline"), "inline");
  assert.equal(resolveQueueMode("redis"), "redis");
  assert.throws(() => resolveQueueMode("unknown"), /EXECUTION_QUEUE_MODE must be inline or redis/);
});
