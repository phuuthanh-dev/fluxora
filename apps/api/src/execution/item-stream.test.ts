import assert from "node:assert/strict";
import test from "node:test";
import type { WorkflowNode, WorkflowNodeType } from "@workflow/contracts";
import { assertLinearItemPath, maximumOutputItems, outputItems } from "./item-stream";

const node = (type: WorkflowNodeType): WorkflowNode => ({ id: "source", type, position: { x: 0, y: 0 }, config: {} });

test("explicit list outputs become individual linked items, while other arrays stay intact", () => {
  const source = node("action.postgres.select");
  const output = { rows: [{ id: 1 }, { id: 2 }], count: 2 };
  assert.deepEqual(outputItems(source, {}, output, { nodeId: "previous", itemIndex: 0 }), [
    { json: { id: 1 }, pairedItem: { nodeId: "previous", itemIndex: 0 } },
    { json: { id: 2 }, pairedItem: { nodeId: "previous", itemIndex: 0 } },
  ]);
  assert.deepEqual(outputItems(node("action.google-calendar.availability"), {}, { available: false, busy: [{ start: "x" }] }), [{ json: { available: false, busy: [{ start: "x" }] } }]);
  assert.deepEqual(outputItems(node("action.google-drive"), { operation: "downloadText" }, { text: "example" }), [{ json: { text: "example" } }]);
});

test("item flows fail explicitly on branches and joins before downstream execution", () => {
  const source = node("action.postgres.select");
  const target = { ...node("action.telegram.message"), id: "send" };
  const third = { ...node("action.github"), id: "other" };
  const graph = { nodes: [source, target, third], edges: [{ id: "one", source: "source", target: "send", kind: "success" as const }] };
  assert.doesNotThrow(() => assertLinearItemPath(graph, source.id));
  assert.throws(() => assertLinearItemPath({ ...graph, edges: [...graph.edges, { id: "two", source: "source", target: "other", kind: "success" }] }, source.id), { code: "ITEM_FLOW_UNSUPPORTED" });
  assert.throws(() => assertLinearItemPath({ ...graph, edges: [...graph.edges, { id: "join", source: "other", target: "send", kind: "success" }] }, source.id), { code: "ITEM_FLOW_UNSUPPORTED" });
});

test("empty and malformed collections have bounded and explicit behavior", () => {
  const sheet = node("action.google-sheets");
  assert.deepEqual(outputItems(sheet, { operation: "read" }, {}), []);
  assert.deepEqual(outputItems(sheet, { operation: "read" }, { values: [["one", "two"]] }), [{ json: { value: ["one", "two"] } }]);
  assert.equal(outputItems(node("action.mongodb"), {}, { documents: Array.from({ length: maximumOutputItems }, (_, id) => ({ id })) }).length, maximumOutputItems);
  assert.throws(() => outputItems(node("action.mongodb"), {}, { documents: Array.from({ length: maximumOutputItems + 1 }, () => ({})) }), { code: "ITEM_LIMIT_EXCEEDED" });
  assert.throws(() => outputItems(node("action.mongodb"), {}, { documents: "invalid" }), { code: "INVALID_PROVIDER_RESPONSE" });
});
