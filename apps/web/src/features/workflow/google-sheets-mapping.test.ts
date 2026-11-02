import assert from "node:assert/strict";
import test from "node:test";
import { applySheetsMapping, columnLabel, literalSheetTitle, sheetRange, sheetsBaseline, type SheetsMappingDraft } from "./google-sheets-mapping";

const config = { credentialId: "google-1", spreadsheetId: "sheet-1", operation: "append", range: "Existing!D5:F", values: [[42, true], ["keep", "row"]], unrelated: "preserve" };
const draft = (): SheetsMappingDraft => ({ kind: "sheets", baseline: sheetsBaseline("ws", config), tab: "Bob's tab", headers: [{ column: 1, name: "Name" }, { column: 2, name: "" }, { column: 3, name: "Name" }], mappedValues: null });

test("tab preview changes only the range and escapes the exact name", () => {
  const result = applySheetsMapping("ws", config, draft());
  assert.equal(result.range, "'Bob''s tab'!A1");
  assert.deepEqual(result.values, config.values);
  assert.equal(result.unrelated, "preserve");
  assert.equal(config.range, "Existing!D5:F");
  assert.equal(sheetRange("Sales!Q1", "append"), "'Sales!Q1'!A1");
  assert.equal(sheetRange("Sales!Q1", "update"), "'Sales!Q1'!A1");
  assert.equal(literalSheetTitle("{{ steps.tab }}"), false);
});

test("read preview spans rows across columns A through CV and preserves the existing values", () => {
  const readConfig = { ...config, operation: "read", range: "Other!D3:D4" };
  const result = applySheetsMapping("ws", readConfig, { ...draft(), baseline: sheetsBaseline("ws", readConfig) });
  assert.equal(result.range, "'Bob''s tab'!A:CV");
  assert.deepEqual(result.values, readConfig.values);
  assert.equal(readConfig.range, "Other!D3:D4");
});

test("append mapping preserves positions for blank and duplicate labels", () => {
  const result = applySheetsMapping("ws", config, { ...draft(), mappedValues: ["{{ steps.first.output }}", "", "last"] });
  assert.deepEqual(result.values, [["{{ steps.first.output }}", "", "last"]]);
  assert.equal(columnLabel(1), "A");
  assert.equal(columnLabel(26), "Z");
  assert.equal(columnLabel(27), "AA");
  assert.equal(columnLabel(100), "CV");
});

test("stale and incompatible previews cannot be applied", () => {
  for (const patch of [{ credentialId: "other" }, { spreadsheetId: "other" }, { operation: "read" }, { range: "Changed!A1" }, { values: [["changed"]] }]) {
    assert.throws(() => applySheetsMapping("ws", { ...config, ...patch }, draft()), /changed/);
  }
  assert.throws(() => applySheetsMapping("other-workspace", config, draft()), /changed/);
  assert.throws(() => applySheetsMapping("ws", config, { ...draft(), mappedValues: ["only one"] }), /no longer valid/);
  const readConfig = { ...config, operation: "read" };
  assert.throws(() => applySheetsMapping("ws", readConfig, { ...draft(), baseline: sheetsBaseline("ws", readConfig), mappedValues: ["a", "b", "c"] }), /no longer valid/);
});
