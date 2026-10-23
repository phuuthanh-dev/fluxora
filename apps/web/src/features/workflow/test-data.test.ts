import assert from "node:assert/strict";
import test from "node:test";
import { createNodeData, getNodeDefinition, type WorkflowCanvasNode } from "./node-catalog";
import { manualTriggerTestData } from "./test-data";

test("uses only an object from the Manual trigger as mock execution data", () => {
  const definition = getNodeDefinition("trigger.manual");
  assert.ok(definition);
  const node: WorkflowCanvasNode = { id: "manual", type: "workflowNode", position: { x: 0, y: 0 }, data: { ...createNodeData(definition), config: { testData: { account: "Thanh", total: 42 } } } };
  assert.deepEqual(manualTriggerTestData([node]), { account: "Thanh", total: 42 });
  node.data.config.testData = ["not", "an", "object"];
  assert.deepEqual(manualTriggerTestData([node]), {});
});
