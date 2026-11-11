import assert from "node:assert/strict";
import test from "node:test";
import { readSheetSnapshot, sheetChanges, sheetCheckpoint } from "./sheets-trigger-protocol";

const token = "synthetic-token";
function transport(values: unknown[][]) { return (async () => Response.json({ values })) as never; }
async function snapshot(values: unknown[][]) { return readSheetSnapshot(token, "spreadsheet", "Sheet 1", "ID", transport(values)); }

test("Sheets rows baseline existing keys and emit only new keys even after sorting", async () => {
  const initial = await snapshot([["ID", "Name"], ["one", "A"], ["two", "B"]]);
  const cursor = JSON.stringify(sheetCheckpoint(initial));
  const next = await snapshot([["ID", "Name"], ["two", "B2"], ["one", "A"], ["three", "C"]]);
  const result = sheetChanges(cursor, next);
  assert.equal(result.changes.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result.changes[0]?.item)), { rowNumber: 4, values: { ID: "three", Name: "C" } });
  assert.equal(sheetChanges(result.cursor, next).changes.length, 0);
});

test("Sheets trigger stops instead of silently advancing on duplicate, removed or changed keys and headers", async () => {
  const initial = await snapshot([["ID", "Name"], ["one", "A"]]);
  const cursor = JSON.stringify(sheetCheckpoint(initial));
  await assert.rejects(snapshot([["ID", "Name"], ["one", "A"], ["one", "B"]]), /duplicate/);
  await assert.rejects(snapshot([["ID", "Name"], ["", "A"]]), /unique value/);
  assert.throws(() => sheetChanges(cursor, { ...initial, rows: [] }), /removed or changed/);
  assert.throws(() => sheetChanges(cursor, { ...initial, headerHash: "f".repeat(64) }), /headers changed/);
  assert.throws(() => sheetChanges("not-json", initial), /checkpoint is invalid/);
});

test("Sheets trigger quotes tab names and bounds rows without exposing tokens", async () => {
  let seen = "";
  const reader = (async (url: string | URL | Request) => { seen = String(url); return Response.json({ values: [["ID"], ["one"]] }); }) as never;
  await readSheetSnapshot(token, "spreadsheet", "Owner's tab", "ID", reader);
  assert.match(decodeURIComponent(seen), /'Owner''s tab'!A1:CW1002/);
  assert.doesNotMatch(seen, /synthetic-token/);
  await assert.rejects(snapshot([["ID"], ...Array.from({ length: 1001 }, (_, i) => [String(i)])]), /1,000 rows/);
});
