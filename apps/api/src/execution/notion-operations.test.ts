import test from "node:test";
import assert from "node:assert/strict";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { redactValue } from "./redaction";
import { executeNotionOperation, listNotionBlockChildren, retrieveNotionPage, retrieveNotionPageProperty } from "./notion-operations";

const pageId = "01234567-89ab-cdef-0123-456789abcdef";
const blockId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const token = "synthetic-token";
const failure = (code: string, retryable?: boolean) => (error: unknown) => error instanceof NodeFailure && error.code === code && (retryable === undefined || error.retryable === retryable) && !error.message.includes(token);

test("page retrieval uses the fixed guarded transport contract and preserves properties", async () => {
  let requests = 0;
  const output = await retrieveNotionPage({ token, pageId }, async (url, init) => {
    requests++;
    assert.equal(url, `https://api.notion.com/v1/pages/${pageId}`);
    assert.equal(init.method, "GET");
    assert.deepEqual(init.headers, { authorization: `Bearer ${token}`, "notion-version": "2022-06-28", accept: "application/json" });
    assert.ok(init.signal);
    return Response.json({ object: "page", id: pageId, properties: { Name: { id: "title", type: "title", title: [{ plain_text: "Example" }] } } });
  });
  assert.equal(requests, 1);
  assert.deepEqual(output.page.properties, { Name: { id: "title", type: "title", title: [{ plain_text: "Example" }] } });
  assert.equal(JSON.stringify(output).includes(token), false);
  assert.match(output.outputInfo.completeness, /properties may be incomplete/);
  assert.match(output.outputInfo.redaction, /Sensitive keys/);
  await assert.rejects(retrieveNotionPage({ token, pageId }, async () => Response.json({ object: "page", id: blockId })), failure("INVALID_RESPONSE", false));
});

test("children use one opaque cursor and never discard overfull provider results", async () => {
  let requests = 0;
  const result = await listNotionBlockChildren({ token, blockId, pageSize: 2, cursor: "opaque+/= cursor" }, async (url) => {
    requests++;
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://api.notion.com");
    assert.equal(parsed.pathname, `/v1/blocks/${blockId}/children`);
    assert.equal(parsed.searchParams.get("page_size"), "2");
    assert.equal(parsed.searchParams.get("start_cursor"), "opaque+/= cursor");
    return Response.json({ object: "list", results: [{ object: "block", id: pageId, type: "paragraph", has_children: true, paragraph: { rich_text: [{ plain_text: "Hello" }] } }], has_more: true, next_cursor: "next+opaque/=" });
  });
  assert.equal(requests, 1);
  assert.equal(result.blocks[0]?.has_children, true);
  assert.equal(result.hasMore, true);
  assert.equal(result.nextCursor, "next+opaque/=");
  await assert.rejects(listNotionBlockChildren({ token, blockId, pageSize: 1 }, async () => Response.json({ object: "list", results: [{ object: "block" }, { object: "block" }], has_more: false, next_cursor: null })), failure("INVALID_RESPONSE", false));
});

test("property IDs are encoded exactly once and both list and singleton shapes work", async () => {
  const list = await retrieveNotionPageProperty({ token, pageId, propertyId: "f%5C%3Ap", pageSize: 1 }, async (url) => {
    assert.equal(new URL(url).pathname, `/v1/pages/${pageId}/properties/f%5C%3Ap`);
    return Response.json({ object: "list", type: "property_item", results: [{ object: "property_item", id: "f%5C%3Ap", type: "relation", relation: { id: blockId } }], has_more: true, next_cursor: "cursor-2", property_item: { id: "f%5C%3Ap", type: "rollup", rollup: { type: "incomplete", function: "sum", incomplete: {} }, next_url: "https://malicious.invalid/" } });
  });
  assert.equal(list.kind, "list");
  if (list.kind === "list") {
    assert.equal(list.items.length, 1);
    assert.deepEqual(list.property.rollup, { type: "incomplete", function: "sum", incomplete: {} });
    assert.equal("next_url" in list.property, false);
    assert.equal(list.nextCursor, "cursor-2");
    const final = await retrieveNotionPageProperty({ token, pageId, propertyId: "f%5C%3Ap", pageSize: 1, cursor: list.nextCursor ?? undefined }, async (url) => {
      assert.equal(new URL(url).searchParams.get("start_cursor"), "cursor-2");
      return Response.json({ object: "list", type: "property_item", results: [], has_more: false, next_cursor: null, property_item: { id: "f%5C%3Ap", type: "rollup", rollup: { type: "number", function: "sum", number: 13 }, next_url: null } });
    });
    assert.equal(final.hasMore, false);
    if (final.kind === "list") assert.deepEqual(final.property.rollup, { type: "number", function: "sum", number: 13 });
    else assert.fail("expected a property list");
  }
  const item = await retrieveNotionPageProperty({ token, pageId, propertyId: "title", pageSize: 20 }, async () => Response.json({ object: "property_item", id: "title", type: "number", number: 42 }));
  assert.equal(item.kind, "item");
  if (item.kind === "item") assert.deepEqual(item.item, { object: "property_item", id: "title", type: "number", number: 42 });
  assert.equal(item.hasMore, false);
  assert.equal(item.nextCursor, null);
  assert.match(item.outputInfo.completeness, /Rollup/);
});

test("rejects invalid input before any request, including path and cursor injection", async () => {
  let calls = 0;
  const transport = async () => { calls++; return Response.json({}); };
  for (const id of ["../search", `${pageId}/children`, "01234567-89ab-cdef-0123-456789abcde-", ""]) await assert.rejects(retrieveNotionPage({ token, pageId: id }, transport), failure("INVALID_INPUT", false));
  for (const propertyId of ["../search", "%2e%2e", "%2Fsearch", "%zz", "a".repeat(257)]) await assert.rejects(retrieveNotionPageProperty({ token, pageId, propertyId, pageSize: 20 }, transport), failure("INVALID_INPUT", false));
  for (const cursor of ["bad\nheader", "x".repeat(1025), "\ud800"]) await assert.rejects(listNotionBlockChildren({ token, blockId, pageSize: 20, cursor }, transport), failure("INVALID_INPUT", false));
  for (const pageSize of [0, 101, 1.5, NaN]) await assert.rejects(listNotionBlockChildren({ token, blockId, pageSize }, transport), failure("INVALID_INPUT", false));
  assert.equal(calls, 0);
});

test("malformed pagination and provider responses fail without exposing details", async () => {
  const invalid = [
    { object: "list", results: [], has_more: true, next_cursor: null },
    { object: "list", results: [], has_more: false, next_cursor: "unexpected" },
    { object: "list", results: [], has_more: true, next_cursor: "x".repeat(1025) },
    { object: "list", results: [], has_more: true, next_cursor: "https://example.test/file?signature=synthetic" },
    { object: "list", results: [], has_more: true, next_cursor: "/botopaque/cursor" },
    { object: "list", results: [{ object: "page" }], has_more: false, next_cursor: null },
    { object: "list", results: [], has_more: "false", next_cursor: null },
  ];
  for (const payload of invalid) await assert.rejects(listNotionBlockChildren({ token, blockId, pageSize: 20 }, async () => Response.json(payload)), failure("INVALID_RESPONSE", false));
  await assert.rejects(retrieveNotionPageProperty({ token, pageId, propertyId: "title", pageSize: 20 }, async () => Response.json({ object: "list", results: [], has_more: false, next_cursor: null })), failure("INVALID_RESPONSE", false));
  await assert.rejects(retrieveNotionPage({ token, pageId }, async () => new Response(`not-json ${token}`)), failure("INVALID_RESPONSE", false));
  await assert.rejects(retrieveNotionPage({ token, pageId }, async () => { throw new Error(`network ${token}`); }), failure("NETWORK_ERROR", true));
  await assert.rejects(retrieveNotionPage({ token: "bad\u0000token", pageId }, async () => { throw new Error("must not request"); }), failure("CREDENTIAL_INVALID", false));
  for (const [status, retryable] of [[403, false], [404, false], [429, true], [503, true]] as const) {
    await assert.rejects(retrieveNotionPage({ token, pageId }, async () => new Response(token, { status })), failure("HTTP_ERROR", retryable));
  }
});

test("Notion error responses release their body without returning provider content", async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } }), { status: 429 });
  await assert.rejects(retrieveNotionPage({ token, pageId }, async () => response), failure("HTTP_ERROR", true));
  assert.equal(cancelled, true);
});

test("guarded transport blocks cross-origin redirects without forwarding the token", async () => {
  let requests = 0;
  const transport = (url: string, init: RequestInit) => fetchSafeOutbound(url, init, {
    resolveHost: async () => ["8.8.8.8"],
    fetchImplementation: async (_url, captured) => {
      requests++;
      assert.equal((captured?.headers as Record<string, string>).authorization, `Bearer ${token}`);
      return new Response(null, { status: 302, headers: { location: "https://attacker.example/path" } });
    },
  });
  await assert.rejects(retrieveNotionPage({ token, pageId }, transport), failure("OUTBOUND_REDIRECT_BLOCKED", false));
  assert.equal(requests, 1);
});

test("streaming and serialized output bounds reject oversized payloads", async () => {
  await assert.rejects(retrieveNotionPage({ token, pageId }, async () => new Response(JSON.stringify({ object: "page", id: pageId, text: "x".repeat(1_000_000) }))), failure("RESPONSE_TOO_LARGE", false));
  // The provider body fits, but wrapping the page pushes output over the limit.
  const prefix = `{"object":"page","id":"${pageId}","text":"`;
  const body = `${prefix}${"x".repeat(999_995 - Buffer.byteLength(prefix) - 2)}"}`;
  await assert.rejects(retrieveNotionPage({ token, pageId }, async () => new Response(body)), failure("RESPONSE_TOO_LARGE", false));
});

test("mock avoids vault and network; live reads the workspace-scoped Notion credential", async () => {
  const calls: unknown[][] = [];
  const credentials = { readForExecution: async (...args: unknown[]) => { calls.push(args); return { token }; } } as unknown as CredentialService;
  const never = async () => { throw new Error("unexpected transport"); };
  const mock = await executeNotionOperation({ pageId }, "retrievePage", "mock", "workspace", credentials, never);
  assert.equal(mock.status, "succeeded");
  assert.equal(calls.length, 0);
  const propertyMock = await executeNotionOperation({ pageId, propertyId: "title" }, "retrieveProperty", "mock", "workspace", credentials, never);
  assert.ok("kind" in propertyMock.output && propertyMock.output.kind === "item");
  await assert.rejects(executeNotionOperation({ pageId, propertyId: "../bad" }, "retrieveProperty", "mock", "workspace", credentials, never), failure("INVALID_INPUT", false));
  assert.equal(calls.length, 0);
  await assert.rejects(executeNotionOperation({ pageId }, "retrievePage", "live", "workspace", credentials, never), failure("CREDENTIAL_REQUIRED", false));
  const result = await executeNotionOperation({ credentialId: "connection", blockId, pageSize: 1, cursor: "next" }, "listChildren", "live", "workspace", credentials, async (url, init) => {
    assert.equal((init.headers as Record<string, string>).authorization, `Bearer ${token}`);
    assert.equal(new URL(url).searchParams.get("start_cursor"), "next");
    return Response.json({ object: "list", results: [], has_more: false, next_cursor: null });
  });
  assert.deepEqual(calls, [["connection", "workspace", "NOTION"]]);
  assert.equal(result.status, "succeeded");
  assert.equal(result.route, "success");
  assert.ok("blocks" in result.output);
  if ("blocks" in result.output) {
    assert.deepEqual(result.output.blocks, []);
    assert.equal(result.output.hasMore, false);
    assert.equal(result.output.nextCursor, null);
  }
  assert.match(result.output.outputInfo.completeness, /direct children/);
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("nested file capabilities and semantic secrets are removed before downstream or persistence", async () => {
  const signed = "https://files.example.test/doc?X-Amz-Credential=synthetic-credential&X-Amz-Signature=synthetic-signature";
  const bareHosted = "https://files.example.test/unusual-synthetic-capability";
  const ordinary = "https://example.test/public";
  const signedKey = "https://example.test/property?sig=synthetic-property";
  const page = await retrieveNotionPage({ token, pageId }, async () => Response.json({
    object: "page", id: pageId,
    icon: { type: "file", file: { url: signed, expiry_time: "2099-01-01T00:00:00Z" } },
    cover: { type: "file", file: { url: bareHosted, expiry_time: "2099-01-01T00:00:00Z" } },
    properties: {
      "Token count": { type: "number", number: 42 },
      [signedKey]: { type: "url", url: signed },
      Link: { type: "url", url: ordinary },
      Description: { type: "rich_text", rich_text: [{ plain_text: `before ${signed} after`, href: signed }] },
      Echo: { type: "rich_text", rich_text: [{ plain_text: `echo ${token}` }] },
      Files: { type: "files", files: [{ name: "document", type: "file", file: { url: signed } }, { name: "external", type: "external", external: { url: ordinary } }] },
    },
  }));
  const text = JSON.stringify(page);
  for (const secret of ["synthetic-credential", "synthetic-signature", "synthetic-property", bareHosted, token]) assert.ok(!text.includes(secret));
  assert.equal((page.page.icon as { file: { url: string } }).file.url, "[REDACTED]");
  assert.equal((page.page.cover as { file: { url: string } }).file.url, "[REDACTED]");
  const properties = page.page.properties as Record<string, unknown>;
  assert.equal(properties["Token count"], "[REDACTED]");
  assert.ok(text.includes(ordinary));
  assert.deepEqual(redactValue(page), page);

  const children = await listNotionBlockChildren({ token, blockId, pageSize: 1 }, async () => Response.json({
    object: "list", has_more: false, next_cursor: null,
    results: [{ object: "block", type: "image", image: { type: "file", file: { url: signed }, caption: [{ plain_text: `See ${signed}` }] } }],
  }));
  assert.ok(!JSON.stringify(children).includes("synthetic-signature"));
  assert.deepEqual(redactValue(children), children);
  const property = await retrieveNotionPageProperty({ token, pageId, propertyId: "title", pageSize: 1 }, async () => Response.json({
    object: "property_item", id: "title", type: "files", files: [{ type: "file", file: { url: signed } }],
  }));
  assert.ok(!JSON.stringify(property).includes("synthetic-signature"));
  assert.deepEqual(redactValue(property), property);
  const propertyList = await retrieveNotionPageProperty({ token, pageId, propertyId: "title", pageSize: 1 }, async () => Response.json({
    object: "list", type: "property_item", has_more: false, next_cursor: null,
    property_item: { id: "title", type: "rich_text", next_url: null },
    results: [{ object: "property_item", type: "rich_text", rich_text: { text: { link: { url: signed } } } }],
  }));
  assert.ok(!JSON.stringify(propertyList).includes("synthetic-signature"));
  assert.deepEqual(redactValue(propertyList), propertyList);
});

test("opaque cursors are bounded to 1024 and empty cursors are omitted", async () => {
  const transport = async (url: string) => {
    const query = new URL(url).searchParams;
    const cursor = query.get("start_cursor");
    assert.ok(cursor === null || cursor === "x".repeat(1024));
    return Response.json({ object: "list", results: [], has_more: false, next_cursor: null });
  };
  await listNotionBlockChildren({ token, blockId, pageSize: 1, cursor: "" }, transport);
  await listNotionBlockChildren({ token, blockId, pageSize: 1, cursor: "x".repeat(1024) }, transport);
  const credentials = { readForExecution: async () => ({ token }) } as unknown as CredentialService;
  const mock = await executeNotionOperation({ blockId, cursor: "" }, "listChildren", "mock", "workspace", credentials, transport);
  assert.equal(mock.status, "succeeded");
  assert.deepEqual(redactValue(mock.output), mock.output);
  const live = await executeNotionOperation({ credentialId: "connection", blockId, cursor: "" }, "listChildren", "live", "workspace", credentials, transport);
  assert.equal(live.status, "succeeded");
  await retrieveNotionPageProperty({ token, pageId, propertyId: "title", pageSize: 1, cursor: "" }, async (url) => {
    assert.equal(new URL(url).searchParams.has("start_cursor"), false);
    return Response.json({ object: "property_item", id: "title", type: "number", number: 1 });
  });
  await assert.rejects(retrieveNotionPage({ token: "page", pageId }, async () => Response.json({ object: "page", id: pageId })), failure("INVALID_RESPONSE", false));
});

test("excessive nested provider data fails safely", async () => {
  let nested: unknown = "value";
  for (let depth = 0; depth < 105; depth++) nested = { child: nested };
  await assert.rejects(retrieveNotionPage({ token, pageId }, async () => Response.json({ object: "page", id: pageId, nested })), failure("INVALID_RESPONSE", false));
});

test("redaction refuses property-key collisions instead of losing a value", async () => {
  const properties = {
    "https://example.test/?signature=one": { type: "number", number: 1 },
    "https://example.test/?signature=two": { type: "number", number: 2 },
  };
  await assert.rejects(retrieveNotionPage({ token, pageId }, async () => Response.json({ object: "page", id: pageId, properties })), failure("INVALID_RESPONSE", false));
});
