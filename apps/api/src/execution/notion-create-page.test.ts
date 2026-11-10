import assert from "node:assert/strict";
import test from "node:test";
import { CredentialProvider } from "@prisma/client";
import { executeNotionAppendBlock, executeNotionCreatePage, executeNotionUpdateTitle } from "./notion-create-page";
import { NodeFailure } from "./node-failure";

const parentPageId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const createdPageId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const config = { credentialId: "connection", parentPageId, title: "Daily report", content: "Prepared by Fluxora" };
const reads: unknown[] = [];
const credentials = { readForExecution: async (...args: unknown[]) => { reads.push(args); return { token: "synthetic-notion-token" }; } } as never;

test("append paragraph sends one bounded write and rejects uncertain results", async () => {
  const input = { credentialId: "connection", pageId: parentPageId, content: "Sample report" };
  const result = await executeNotionAppendBlock(input, "live", "workspace", credentials, async (url, init) => {
    assert.equal(url, `https://api.notion.com/v1/blocks/${parentPageId}/children`);
    assert.equal(init.method, "PATCH");
    assert.equal(JSON.parse(String(init.body)).children[0].paragraph.rich_text[0].text.content, "Sample report");
    return Response.json({ results: [{ object: "block", id: createdPageId }] });
  });
  assert.deepEqual(result.output, { pageId: parentPageId, blockId: createdPageId });
  await assert.rejects(() => executeNotionAppendBlock(input, "live", "workspace", credentials, async () => { throw Error("connection lost"); }), (e: unknown) => e instanceof NodeFailure && e.code === "DELIVERY_UNCERTAIN" && !e.retryable);
});

test("creates a child page with the workspace connection and only returns identifiers", async () => {
  reads.length = 0;
  const result = await executeNotionCreatePage(config, "live", "workspace", credentials, async (url, init) => {
    assert.equal(url, "https://api.notion.com/v1/pages");
    assert.equal(init.method, "POST");
    const headers = new Headers(init.headers);
    assert.equal(headers.get("notion-version"), "2022-06-28");
    assert.equal(headers.get("authorization"), "Bearer synthetic-notion-token");
    assert.deepEqual(JSON.parse(String(init.body)), {
      parent: { type: "page_id", page_id: parentPageId },
      properties: { title: { type: "title", title: [{ type: "text", text: { content: "Daily report" } }] } },
      children: [{ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: "Prepared by Fluxora" } }] } }],
    });
    return Response.json({ object: "page", id: createdPageId, other: "synthetic-notion-token" });
  });
  assert.deepEqual(reads, [["connection", "workspace", CredentialProvider.NOTION]]);
  assert.deepEqual(result.output, { pageId: createdPageId, parentPageId });
});

test("mock validates input without reading a credential or sending requests", async () => {
  const never = { readForExecution: () => { throw Error("unexpected vault read"); } } as never;
  const result = await executeNotionCreatePage(config, "mock", "workspace", never, async () => { throw Error("unexpected request"); });
  assert.equal(result.output.parentPageId, parentPageId);
  for (const bad of [{ ...config, parentPageId: "other" }, { ...config, title: " " }, { ...config, title: "x".repeat(2001) }, { ...config, content: undefined }, { ...config, content: "x".repeat(2001) }]) {
    await assert.rejects(() => executeNotionCreatePage(bad, "mock", "workspace", never), (e: unknown) => e instanceof NodeFailure && e.code === "INVALID_INPUT" && !e.retryable);
  }
});

test("uncertain write outcomes cannot be automatically retried or leak response data", async () => {
  for (const status of [302, 408, 429, 500, 503]) {
    await assert.rejects(() => executeNotionCreatePage(config, "live", "workspace", credentials, async () => new Response("synthetic-notion-token", { status })), (e: unknown) => e instanceof NodeFailure && e.code === "DELIVERY_UNCERTAIN" && !e.retryable && !e.message.includes("synthetic-notion-token"));
  }
  for (const transport of [async () => { throw Error("synthetic-notion-token"); }, async () => Response.json({ object: "page", id: "invalid" }), async () => new Response("not-json", { status: 200 })]) {
    await assert.rejects(() => executeNotionCreatePage(config, "live", "workspace", credentials, transport), (e: unknown) => e instanceof NodeFailure && e.code === "DELIVERY_UNCERTAIN" && !e.retryable);
  }
  await assert.rejects(() => executeNotionCreatePage(config, "live", "workspace", credentials, async () => new Response("synthetic-notion-token", { status: 403 })), (e: unknown) => e instanceof NodeFailure && e.code === "NOTION_WRITE_REJECTED" && !e.retryable && !e.message.includes("synthetic-notion-token"));
});

test("updates only the selected page title and checks the returned page identity", async () => {
  reads.length = 0;
  const update = { credentialId: "connection", pageId: parentPageId, title: "Revised title" };
  const result = await executeNotionUpdateTitle(update, "live", "workspace", credentials, async (url, init) => {
    assert.equal(url, `https://api.notion.com/v1/pages/${parentPageId}`);
    assert.equal(init.method, "PATCH");
    assert.deepEqual(JSON.parse(String(init.body)), { properties: { title: { type: "title", title: [{ type: "text", text: { content: "Revised title" } }] } } });
    return Response.json({ object: "page", id: parentPageId.replace(/-/g, "").toUpperCase() });
  });
  assert.deepEqual(reads, [["connection", "workspace", CredentialProvider.NOTION]]);
  assert.deepEqual(result.output, { pageId: parentPageId, updatedField: "title" });
  await assert.rejects(() => executeNotionUpdateTitle(update, "live", "workspace", credentials, async () => Response.json({ object: "page", id: createdPageId })), (e: unknown) => e instanceof NodeFailure && e.code === "DELIVERY_UNCERTAIN" && !e.retryable);
  await assert.rejects(() => executeNotionUpdateTitle(update, "live", "workspace", credentials, async () => { throw Error("connection lost"); }), (e: unknown) => e instanceof NodeFailure && e.code === "DELIVERY_UNCERTAIN" && !e.retryable);
  await assert.rejects(() => executeNotionUpdateTitle({ ...update, title: undefined }, "mock", "workspace", credentials), (e: unknown) => e instanceof NodeFailure && e.code === "INVALID_INPUT");
});
