import assert from "node:assert/strict";
import test from "node:test";
import { nodeConfigIssues } from "@workflow/contracts";
import { executeNotionEntry, notionPropertyBody, notionWritableProperties } from "./notion-entry";
const sourceId = "00000000-0000-4000-8000-000000000001", pageId = "00000000-0000-4000-8000-000000000002";
const token = "synthetic-notion-entry-token";
const schema = { object: "data_source", id: sourceId, properties: { Name: { id: "title", type: "title" }, Text: { id: "txt", type: "rich_text" }, Score: { id: "score", type: "number" }, Stage: { id: "state", type: "status", status: { options: [{ id: "done", name: "Done" }] } }, Day: { id: "day", type: "date" }, Done: { id: "check", type: "checkbox" }, Formula: { id: "formula", type: "formula" } } };
const config = { credentialId: "notion", dataSourceId: sourceId, properties: [{ id: "title", type: "title", value: "Example" }, { id: "score", type: "number", value: 7 }, { id: "state", type: "status", value: "done" }, { id: "check", type: "checkbox", value: true }, { id: "day", type: "date", value: "2026-11-09" }, { id: "txt", type: "rich_text", value: null }] };
const credentials = { readForExecution: async (...args: unknown[]) => { assert.deepEqual(args, ["notion", "workspace", "NOTION"]); return { token }; } };

test("Notion typed creation uses data source schema, supports clearing and never exposes the token", async () => {
  const read = async () => Response.json(schema);
  const fields = await notionWritableProperties(token, sourceId, read);
  assert.equal(fields.properties.length, 6);
  const result = await executeNotionEntry(config, "create", "live", "workspace", credentials as never, read, async (url, init) => {
    assert.equal(url, "https://api.notion.com/v1/pages");
    assert.equal((init.headers as Record<string, string>)["notion-version"], "2025-09-03");
    const body = JSON.parse(String(init.body));
    assert.deepEqual(body.parent, { type: "data_source_id", data_source_id: sourceId });
    assert.deepEqual(body.properties.state, { status: { id: "done" } });
    assert.deepEqual(body.properties.txt, { rich_text: [] });
    assert.deepEqual(body.properties.day, { date: { start: "2026-11-09" } });
    return Response.json({ object: "page", id: pageId });
  });
  assert.equal(result.output.pageId, pageId); assert.ok(!JSON.stringify(result).includes(token));
  assert.throws(() => notionPropertyBody([{ id: "score", type: "number", value: 1 }], fields.properties, true), /title property/);
  assert.throws(() => notionPropertyBody([{ id: "state", type: "status", value: "unknown" }], fields.properties, false), /existing Notion option/);
});

test("Notion update validates parent before writing and ambiguous writes cannot retry", async () => {
  let writes = 0;
  const write = async () => { writes++; return Response.json({ error: "sensitive" }, { status: 503 }); };
  const read = async (url: string) => Response.json(url.includes("data_sources") ? schema : { object: "page", id: pageId, parent: { type: "page_id", page_id: sourceId } });
  await assert.rejects(executeNotionEntry({ ...config, pageId }, "update", "live", "workspace", credentials as never, read, write), { code: "INVALID_INPUT" });
  assert.equal(writes, 0);
  const matching = async (url: string) => Response.json(url.includes("data_sources") ? schema : { object: "page", id: pageId, parent: { type: "data_source_id", data_source_id: sourceId } });
  await assert.rejects(executeNotionEntry({ ...config, pageId }, "update", "live", "workspace", credentials as never, matching, write), { code: "DELIVERY_UNCERTAIN", retryable: false });
  assert.equal(writes, 1);
  await executeNotionEntry(config, "create", "mock", "workspace", {} as never, async () => { throw new Error("must not fetch"); });
  assert.ok(nodeConfigIssues("action.notion.create-entry", { ...config, properties: [{ id: "score", type: "number", value: "wrong" }] }, "resolved").length);
});
