import assert from "node:assert/strict";
import test from "node:test";
import { nodeConfigIssues } from "@workflow/contracts";
import { compareHistoricalItems } from "./historical-deduplication";
import type { WorkflowItem } from "./item-stream";

const key = Buffer.alloc(32, 7);
const input = (...json: Record<string, unknown>[]): WorkflowItem[] => json.map((value) => ({ json: value }));
const empty = () => ({ mode: null, hashes: [], maximum: null });

test("historical comparison retains new values across batches without storing the values", () => {
  const first = compareHistoricalItems(input({ id: "private-one" }, { id: "private-two" }, { id: "private-one" }), ["id"], "new", empty(), 2, key);
  assert.deepEqual(first.keptIndexes, [0, 1, 2]);
  assert.doesNotMatch(JSON.stringify(first.history), /private/);
  const second = compareHistoricalItems(input({ id: "private-one" }, { id: "private-three" }), ["id"], "new", first.history, 2, key);
  assert.deepEqual(second.keptIndexes, [1]);
  assert.deepEqual(compareHistoricalItems(input({ id: "private-one" }), ["id"], "new", second.history, 2, key).keptIndexes, [0]);
  assert.throws(() => compareHistoricalItems(input({ id: 1 }, { id: 2 }, { id: 3 }), ["id"], "new", empty(), 2, key), { code: "DEDUP_HISTORY_LIMIT" });
  assert.throws(() => compareHistoricalItems(input({ id: 1 }), ["id"], "higher", first.history, 2, key), { code: "DEDUP_MODE_CHANGED" });
});

test("historical numeric and date comparisons keep only increasing values", () => {
  const numbers = compareHistoricalItems(input({ n: 2 }, { n: 1 }, { n: 3 }), ["n"], "higher", empty(), 10, key);
  assert.deepEqual(numbers.keptIndexes, [0, 1, 2]);
  assert.deepEqual(compareHistoricalItems(input({ n: 3 }, { n: 4 }), ["n"], "higher", numbers.history, 10, key).keptIndexes, [1]);
  assert.deepEqual(compareHistoricalItems(input({ n: "5" }, { n: "4" }), ["n"], "higher", numbers.history, 10, key).keptIndexes, [0, 1]);
  const dates = compareHistoricalItems(input({ at: "2026-11-17T00:00:00Z" }, { at: "2026-11-16T00:00:00Z" }), ["at"], "later", empty(), 10, key);
  assert.deepEqual(dates.keptIndexes, [0, 1]);
  assert.throws(() => compareHistoricalItems(input({ at: "not-a-date" }), ["at"], "later", dates.history, 10, key), { code: "INVALID_INPUT" });
  assert.throws(() => compareHistoricalItems(input({}), ["id"], "new", empty(), 10, key), { code: "INVALID_INPUT" });
});

test("historical configuration preserves the existing default and validates each mode", () => {
  const issues = (config: Record<string, unknown>) => nodeConfigIssues("action.remove-duplicates", config, "resolved");
  assert.deepEqual(issues({ compare: "all" }), []);
  assert.deepEqual(issues({ operation: "history", historyFields: "id", historyMode: "new" }), []);
  assert.deepEqual(issues({ operation: "clear", historyScope: "workflow" }), []);
  assert.ok(issues({ operation: "history", historyMode: "higher", historyFields: "a,b" }).length);
  assert.ok(issues({ operation: "history", historyFields: "__proto__.value" }).length);
  assert.ok(issues({ operation: "history", historyFields: "id", historySize: 10001 }).length);
});
