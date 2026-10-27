import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionEventsService } from "./execution-events.service";

test("execution event streams only deliver events for their execution", async () => {
  const events = new ExecutionEventsService();
  await new Promise<void>((resolve) => {
    const subscription = events.stream("execution-1").subscribe((event) => {
      assert.deepEqual(event, { data: { executionId: "execution-1", kind: "node.updated" } });
      subscription.unsubscribe();
      resolve();
    });
    events.publish("execution-2", "node.updated");
    events.publish("execution-1", "node.updated");
  });
  await events.onModuleDestroy();
});
