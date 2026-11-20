import assert from "node:assert/strict";
import test from "node:test";
import { airtableResources, airtableTriggerChanges } from "./airtable";

const base = "app12345678901234", table = "tbl12345678901234", field = "fld12345678901234";
const metadata = (name = "Modified", type = "lastModifiedTime") => ({ tables: [{ id: table, fields: [{ id: field, name, type }] }] });
const row = (id: string, timestamp: string) => ({ id, fields: { Modified: timestamp, Name: "Sample" } });

test("Airtable trigger field picker exposes only created or last modified time fields", async () => {
  const schema = { tables: [{ id: table, fields: [{ id: field, name: "Modified", type: "lastModifiedTime" }, { id: "fld22345678901234", name: "Created", type: "createdTime" }, { id: "fld32345678901234", name: "Name", type: "singleLineText" }] }] };
  const result = await airtableResources("token", "trigger-fields", base, table, async () => Response.json(schema));
  assert.deepEqual(result.items.map((item) => item.name), ["Modified", "Created"]);
});

test("Airtable trigger filters by the validated field name and follows every page", async () => {
  const calls: string[] = [];
  const transport = async (url: string) => {
    calls.push(url);
    if (calls.length === 1) return Response.json(metadata());
    if (calls.length === 2) return Response.json({ records: [row("rec12345678901234", "2026-01-01T00:00:01.000Z")], offset: "next" });
    return Response.json({ records: [row("rec22345678901234", "2026-01-01T00:00:02.000Z")] });
  };
  const result = await airtableTriggerChanges("token", base, table, field, "2026-01-01T00:00:00.000Z", transport);
  assert.equal(result.event, "updated");
  assert.equal(result.rows.length, 2);
  const query = new URL(calls[1]!).searchParams;
  assert.equal(query.get("filterByFormula"), "IS_AFTER({Modified}, DATETIME_PARSE('2026-01-01T00:00:00.000Z'))");
  assert.equal(new URL(calls[2]!).searchParams.get("offset"), "next");
});

test("Airtable created-time field reports created events", async () => {
  let calls = 0;
  const transport = async () => ++calls === 1 ? Response.json(metadata("Modified", "createdTime")) : Response.json({ records: [] });
  const result = await airtableTriggerChanges("token", base, table, field, "2026-01-01T00:00:00.000Z", transport);
  assert.equal(result.event, "created");
});

test("Airtable trigger rejects unsafe field names, wrong types and repeated cursors", async () => {
  for (const schema of [metadata("Bad}name"), metadata("Modified", "singleLineText")]) {
    await assert.rejects(airtableTriggerChanges("token", base, table, field, "2026-01-01T00:00:00.000Z", async () => Response.json(schema)));
  }
  let calls = 0;
  const transport = async () => ++calls === 1 ? Response.json(metadata()) : Response.json({ records: [], offset: "same" });
  await assert.rejects(airtableTriggerChanges("token", base, table, field, "2026-01-01T00:00:00.000Z", transport));
});

test("Airtable trigger refuses missing timestamps and timestamps implausibly in the future", async () => {
  for (const value of [null, "2999-01-01T00:00:00.000Z"]) {
    let calls = 0;
    const transport = async () => ++calls === 1 ? Response.json(metadata()) : Response.json({ records: [{ id: "rec12345678901234", fields: { Modified: value } }] });
    await assert.rejects(airtableTriggerChanges("token", base, table, field, "2026-01-01T00:00:00.000Z", transport));
  }
});

test("Airtable trigger treats a rate limit without Retry-After as retryable", async () => {
  await assert.rejects(airtableTriggerChanges("token", base, table, field, "2026-01-01T00:00:00.000Z", async () => new Response(null, { status: 429 })), (error: unknown) => Boolean(error && typeof error === "object" && "retryable" in error && error.retryable === true));
});
