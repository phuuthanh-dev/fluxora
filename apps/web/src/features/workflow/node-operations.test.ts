import assert from "node:assert/strict";
import test from "node:test";
import { initialNodes } from "./node-catalog";
import { duplicateWorkflowNode } from "./node-operations";

test("duplicating a node gives it a new identity and offset position", () => {
  const source = initialNodes[0]!;
  const copy = duplicateWorkflowNode(source, "copy-id");
  assert.equal(copy.id, "copy-id");
  assert.equal(copy.data.label, `${source.data.label} copy`);
  assert.deepEqual(copy.position, { x: source.position.x + 42, y: source.position.y + 42 });
});
