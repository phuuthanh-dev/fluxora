import assert from "node:assert/strict";
import test from "node:test";
import type { WorkflowNode, WorkflowNodeType } from "@workflow/contracts";
import { assertSupportedItemPath, maximumOutputItems, outputItems } from "./item-stream";

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
  assert.doesNotThrow(() => assertSupportedItemPath(graph, source.id));
  assert.throws(() => assertSupportedItemPath({ ...graph, edges: [...graph.edges, { id: "two", source: "source", target: "other", kind: "success" }] }, source.id), { code: "ITEM_FLOW_UNSUPPORTED" });
  assert.throws(() => assertSupportedItemPath({ ...graph, edges: [...graph.edges, { id: "join", source: "other", target: "send", kind: "success" }] }, source.id), { code: "ITEM_FLOW_UNSUPPORTED" });
});

test("item conditions may split paths but cannot rejoin or lead to approval", () => {
  const source = node("action.postgres.select");
  const condition = { ...node("condition.if"), id: "if" };
  const yes = { ...node("action.http-request"), id: "yes" };
  const no = { ...node("action.http-request"), id: "no" };
  const graph = { nodes: [source, condition, yes, no], edges: [
    { id: "source-if", source: "source", target: "if", kind: "success" as const },
    { id: "if-yes", source: "if", target: "yes", kind: "true" as const },
    { id: "if-no", source: "if", target: "no", kind: "false" as const },
  ] };
  assert.doesNotThrow(() => assertSupportedItemPath(graph, source.id));
  assert.throws(() => assertSupportedItemPath({ ...graph, edges: [...graph.edges, { id: "join", source: "no", target: "yes", kind: "success" }] }, source.id), { code: "ITEM_FLOW_UNSUPPORTED" });
  assert.throws(() => assertSupportedItemPath({ ...graph, nodes: [...graph.nodes, { ...node("approval.request"), id: "approval" }], edges: [...graph.edges, { id: "pause", source: "yes", target: "approval", kind: "success" }] }, source.id), { code: "ITEM_FLOW_UNSUPPORTED" });
});

test("a list source may have an error branch, while per-item actions may not", () => {
  const source = node("action.postgres.select");
  const action = { ...node("action.http-request"), id: "action" };
  const recovery = { ...node("action.http-request"), id: "recovery" };
  const graph = { nodes: [source, action, recovery], edges: [
    { id: "ok", source: "source", target: "action", kind: "success" as const },
    { id: "error", source: "source", target: "recovery", kind: "error" as const },
  ] };
  assert.doesNotThrow(() => assertSupportedItemPath(graph, source.id, true));
  assert.throws(() => assertSupportedItemPath({ ...graph, edges: [graph.edges[0]!, { ...graph.edges[1]!, source: "action" }] }, source.id, true), { code: "ITEM_FLOW_UNSUPPORTED" });
  const nestedSource = { ...node("action.supabase.select"), id: "action" };
  assert.throws(() => assertSupportedItemPath({ ...graph, nodes: [source, nestedSource, recovery], edges: [graph.edges[0]!, { ...graph.edges[1]!, source: "action" }] }, source.id, true), { code: "ITEM_FLOW_UNSUPPORTED" });
});

test("empty and malformed collections have bounded and explicit behavior", () => {
  const sheet = node("action.google-sheets");
  assert.deepEqual(outputItems(sheet, { operation: "read" }, {}), []);
  assert.deepEqual(outputItems(sheet, { operation: "read" }, { values: [["one", "two"]] }), [{ json: { value: ["one", "two"] } }]);
  assert.equal(outputItems(node("action.mongodb"), {}, { documents: Array.from({ length: maximumOutputItems }, (_, id) => ({ id })) }).length, maximumOutputItems);
  assert.throws(() => outputItems(node("action.mongodb"), {}, { documents: Array.from({ length: maximumOutputItems + 1 }, () => ({})) }), { code: "ITEM_LIMIT_EXCEEDED" });
  assert.throws(() => outputItems(node("action.mongodb"), {}, { documents: "invalid" }), { code: "INVALID_PROVIDER_RESPONSE" });
});
