import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import test from "node:test";
import type { WorkflowNode } from "@workflow/contracts";
import { matchItems, transformItems } from "./data-transform";
import type { WorkflowItem } from "./item-stream";
const node = (type: WorkflowNode["type"], config: Record<string, unknown>): WorkflowNode => ({ id: "data", type, config, position: { x: 0, y: 0 } });
const items = (...values: Record<string, unknown>[]): WorkflowItem[] => values.map((json, itemIndex) => ({ json, pairedItem: { nodeId: "source", itemIndex } }));

test("Aggregate and Split Out preserve data/provenance and bound fan-out", () => {
  const input = items({ id: 1 }, { id: 2 });
  const aggregated = transformItems(node("action.aggregate", { outputField: "rows" }), input);
  assert.deepEqual(aggregated[0]?.json, { rows: [{ id: 1 }, { id: 2 }] });
  assert.equal(aggregated[0]?.sources?.length, 2);
  assert.deepEqual(transformItems(node("action.aggregate", { outputField: "rows" }), [])[0]?.json, { rows: [] });
  assert.deepEqual(transformItems(node("action.split-out", { field: "rows" }), aggregated).map((item) => item.json), input.map((item) => item.json));
  const original = items({ customer: { id: "a", values: [1, null] }, flag: true });
  const split = transformItems(node("action.split-out", { field: "customer.values", destination: "number", include: "all" }), original);
  assert.deepEqual(split.map((item) => item.json), [{ customer: { id: "a" }, flag: true, number: 1 }, { customer: { id: "a" }, flag: true, number: null }]);
  assert.deepEqual(original[0]?.json.customer, { id: "a", values: [1, null] });
  assert.throws(() => transformItems(node("action.split-out", { field: "rows" }), items({ rows: Array(101).fill(1) })), { code: "ITEM_LIMIT_EXCEEDED" });
  assert.throws(() => transformItems(node("action.split-out", { field: "rows" }), items({ rows: "wrong" })), { code: "INVALID_INPUT" });
  assert.throws(() => transformItems(node("action.aggregate", { outputField: "__proto__" }), input), { code: "INVALID_CONFIGURATION" });
});

test("Sort is stable and typed, Limit handles first/last/zero, persisted redaction stays protected", () => {
  const input = items({ id: "a", n: 3 }, { id: "b", n: 1 }, { id: "c", n: 3 }, { id: "d" });
  const sorted = transformItems(node("action.sort", { field: "n", valueType: "number", direction: "desc" }), input);
  assert.deepEqual(sorted.map((item) => item.json.id), ["a", "c", "b", "d"]);
  assert.deepEqual(transformItems(node("action.limit", { maxItems: 2, keep: "last" }), sorted).map((item) => item.json.id), ["b", "d"]);
  assert.deepEqual(transformItems(node("action.limit", { maxItems: 0 }), input), []);
  assert.throws(() => transformItems(node("action.sort", { field: "n", valueType: "number" }), items({ n: "3" })), { code: "INVALID_INPUT" });
  assert.throws(() => transformItems(node("action.sort", { field: "n" }), [{ json: { n: "[REDACTED]" }, persisted: true }]), (error: unknown) => error instanceof BadRequestException && (error.getResponse() as { code: string }).code === "REDACTED_INPUT_UNAVAILABLE");
  const dates = transformItems(node("action.sort", { field: "date", valueType: "date" }), items({ date: "2026-11-10T00:00:00Z" }, { date: "2026-11-09T00:00:00Z" }));
  assert.equal(dates[0]?.json.date, "2026-11-09T00:00:00Z");
});

test("Matching Merge uses strict keys, first right match, Input2 precedence and optional enrichment", () => {
  const config = { mode: "matching", field1: "customer.id", field2: "key", outputType: "matches" };
  const left = items({ customer: { id: 1 }, value: "left" }, { customer: { id: "1" } }, { value: "missing" }, { customer: { id: null } });
  const right = items({ key: 1, value: "right" }, { key: 1, value: "duplicate" }, { key: null, value: "null" });
  const matched = matchItems(config, left, right);
  assert.equal(matched.length, 1); assert.equal(matched[0]?.json.value, "right"); assert.equal(matched[0]?.sources?.length, 2);
  assert.equal(matchItems({ ...config, outputType: "enrich-input1" }, left, right).length, 4);
  assert.deepEqual(matchItems(config, left, []), []);
  assert.throws(() => matchItems(config, items({ customer: { id: {} } }), right), { code: "INVALID_INPUT" });
});

test("Remove Duplicates compares current input only and retains the first original item", () => {
  const input = items({ id: 1, nested: { a: 1, b: 2 } }, { nested: { b: 2, a: 1 }, id: 1 }, { id: 1, nested: { a: 3 } }, { id: null }, {}, { id: null });
  const all = transformItems(node("action.remove-duplicates", { compare: "all" }), input);
  assert.deepEqual(all, [input[0], input[2], input[3], input[4]]);
  const selected = transformItems(node("action.remove-duplicates", { compare: "selected", fields: "id" }), input);
  assert.deepEqual(selected, [input[0], input[3], input[4]]);
  const except = transformItems(node("action.remove-duplicates", { compare: "except", fields: "nested.a, nested.b" }), input);
  assert.deepEqual(except, [input[0], input[3], input[4]]);
  assert.deepEqual(transformItems(node("action.remove-duplicates", { compare: "all" }), items({ value: [] }, { value: {} })).length, 2);
  assert.throws(() => transformItems(node("action.remove-duplicates", { compare: "selected", fields: "" }), input), { code: "INVALID_CONFIGURATION" });
  assert.throws(() => transformItems(node("action.remove-duplicates", { compare: "all" }), [{ json: { secret: "[REDACTED]" }, persisted: true }]), (error: unknown) => error instanceof BadRequestException && (error.getResponse() as { code: string }).code === "REDACTED_INPUT_UNAVAILABLE");
});
