import test from "node:test";
import assert from "node:assert/strict";
import { executeNotionSearch, searchNotionPages } from "./notion-search";
import type { CredentialService } from "../credentials/credential.service";
import { buildPostgresSelect } from "./postgres-select-query";
import { resolvePostgresTarget } from "./postgres-target";
import type { lookup } from "node:dns/promises";
import { Readable } from "node:stream";
import { rootCertificates } from "node:tls";
import { executePostgresSelect as executePostgresSelectVersioned, readPostgresRows, validatePostgresCredential } from "./postgres-read";
import { resolveExpressions } from "./expression";

// These existing selection tests exercise the new, explicit v2 contract.
const executePostgresSelect = (config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, read?: typeof readPostgresRows) => executePostgresSelectVersioned(config, mode, workspaceId, credentials, read, 2);

test("Notion search sends bounded request and returns only page identifiers and titles", async () => {
  let captured: { url: string; init: RequestInit } | undefined;
  const result = await searchNotionPages({ token: "example-secret", query: "notes", pageSize: 20 }, async (url, init) => {
    captured = { url, init };
    return Response.json({ has_more: false, next_cursor: null, results: [{ object: "page", id: "01234567-89ab-cdef-0123-456789abcdef", properties: { Name: { type: "title", title: [{ plain_text: "Notes" }] } }, extra: "do not expose" }] });
  });
  assert.equal(captured?.url, "https://api.notion.com/v1/search");
  assert.deepEqual(JSON.parse(String(captured?.init.body)).filter, { value: "page", property: "object" });
  assert.deepEqual(result, { pages: [{ id: "01234567-89ab-cdef-0123-456789abcdef", title: "Notes" }], hasMore: false, nextCursor: null });
  assert.equal(JSON.stringify(result).includes("example-secret"), false);
});

test("Notion failures are sanitized and requests reject invalid bounds", async () => {
  await assert.rejects(searchNotionPages({ token: "secret", query: "", pageSize: 101 }), /Invalid Notion search/);
  await assert.rejects(searchNotionPages({ token: "secret", query: "", pageSize: 20 }, async () => new Response("secret", { status: 403 })), (error: unknown) => error instanceof Error && !error.message.includes("secret") && /403/.test(error.message));
});

test("Notion search passes an opaque continuation cursor through the executor", async () => {
  const credentials = { readForExecution: async () => ({ token: "synthetic" }) } as unknown as CredentialService;
  const cursor = "opaque/cursor+with=_parts";
  let body: Record<string, unknown> | undefined;
  const result = await executeNotionSearch({ credentialId: "connection", query: "notes", pageSize: 10, cursor }, "live", "workspace", credentials, async (input) =>
    searchNotionPages(input, async (_url, init) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return Response.json({ has_more: false, next_cursor: null, results: [] });
    }));
  assert.equal(body?.start_cursor, cursor);
  assert.equal(result.output.hasMore, false);
  await assert.rejects(executeNotionSearch({ cursor: "bad\nheader" }, "mock", "workspace", credentials), /pagination cursor/);
});

test("Notion can collect successive short pages up to the requested limit", async () => {
  const credentials = { readForExecution: async () => ({ token: "synthetic-token" }) } as unknown as CredentialService;
  const requests: Array<Record<string, unknown>> = [];
  const ids = ["00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", "00000000-0000-0000-0000-000000000003"];
  const search: typeof searchNotionPages = (input) => searchNotionPages(input, async (_url, init) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    requests.push(body);
    const index = requests.length - 1;
    return Response.json({ has_more: true, next_cursor: `cursor-${index + 1}`, results: [{ object: "page", id: ids[index], properties: {} }] });
  });
  const result = await executeNotionSearch({ credentialId: "connection", query: "notes", pageSize: 3, collectPages: true }, "live", "workspace", credentials, search);
  assert.deepEqual(requests.map((request) => [request.page_size, request.start_cursor, request.query]), [[3, undefined, "notes"], [2, "cursor-1", "notes"], [1, "cursor-2", "notes"]]);
  assert.deepEqual(result.output.pages.map((page) => page.id), ids);
  assert.equal(result.output.hasMore, true);
  assert.equal(result.output.nextCursor, "cursor-3");
});

test("Notion automatic pagination stops after five requests and rejects repeated cursors", async () => {
  const credentials = { readForExecution: async () => ({ token: "synthetic-token" }) } as unknown as CredentialService;
  let calls = 0;
  const emptyPages: typeof searchNotionPages = async () => ({ pages: [], hasMore: true, nextCursor: `cursor-${++calls}` });
  const capped = await executeNotionSearch({ credentialId: "connection", pageSize: 10, collectPages: true }, "live", "workspace", credentials, emptyPages);
  assert.equal(calls, 5);
  assert.equal(capped.output.nextCursor, "cursor-5");
  assert.equal(capped.output.hasMore, true);
  calls = 0;
  const repeated: typeof searchNotionPages = async () => { calls++; return { pages: [], hasMore: true, nextCursor: "same-cursor" }; };
  await assert.rejects(executeNotionSearch({ credentialId: "connection", pageSize: 10, collectPages: true }, "live", "workspace", credentials, repeated), /repeated or missing/);
  assert.equal(calls, 2);
  await assert.rejects(searchNotionPages({ token: "synthetic-token", query: "", pageSize: 1, requireBoundedPage: true }, async () => Response.json({ results: [{}, {}], has_more: false, next_cursor: null })), /more results than requested/);
  await assert.rejects(searchNotionPages({ token: "synthetic-token", query: "", pageSize: 1, requireBoundedPage: true }, async () => Response.json({ results: [{}], has_more: false, next_cursor: null })), /invalid page result/);
  await assert.rejects(executeNotionSearch({ collectPages: "true" }, "mock", "workspace", credentials), /Choose whether/);
});

test("Notion automatic pagination reports exhaustion and does not return partial output on failure", async () => {
  const credentials = { readForExecution: async () => ({ token: "synthetic-token" }) } as unknown as CredentialService;
  let calls = 0;
  const search: typeof searchNotionPages = async () => ++calls === 1
    ? { pages: [{ id: "first", title: "First" }], hasMore: true, nextCursor: "next" }
    : { pages: [{ id: "second", title: "Second" }], hasMore: false, nextCursor: null };
  const result = await executeNotionSearch({ credentialId: "connection", pageSize: 5, collectPages: true }, "live", "workspace", credentials, search);
  assert.equal(result.output.pages.length, 2);
  assert.equal(result.output.hasMore, false);
  assert.equal(result.output.nextCursor, null);
  calls = 0;
  const failing: typeof searchNotionPages = async () => {
    if (++calls === 1) return { pages: [{ id: "first", title: "First" }], hasMore: true, nextCursor: "next" };
    throw new Error("provider failed");
  };
  await assert.rejects(executeNotionSearch({ credentialId: "connection", pageSize: 5, collectPages: true }, "live", "workspace", credentials, failing), /provider failed/);
  assert.equal(calls, 2);
});

test("Notion search remains one request unless automatic pagination is explicitly enabled", async () => {
  const credentials = { readForExecution: async () => ({ token: "synthetic-token" }) } as unknown as CredentialService;
  let calls = 0;
  const search: typeof searchNotionPages = async () => { calls++; return { pages: [], hasMore: true, nextCursor: "next" }; };
  const result = await executeNotionSearch({ credentialId: "connection" }, "live", "workspace", credentials, search);
  assert.equal(calls, 1);
  assert.equal(result.output.nextCursor, "next");
  await executeNotionSearch({ credentialId: "connection", collectPages: true }, "live", "workspace", credentials, search, 1);
  assert.equal(calls, 2);
});

test("Notion respects bounded Retry-After and declines unsafe shorter retries", async () => {
  for (const [header, expectedRetryable, expectedDelay] of [["5", true, 5000], ["120", false, 120000]] as const) {
    await assert.rejects(searchNotionPages({ token: "synthetic", query: "", pageSize: 20 }, async () => new Response(null, { status: 429, headers: { "retry-after": header } })), (reason: unknown) => {
      assert.ok(reason instanceof Error && "retryable" in reason && "retryAfterMs" in reason);
      assert.equal(reason.retryable, expectedRetryable);
      assert.equal(reason.retryAfterMs, expectedDelay);
      return true;
    });
  }
});

test("Notion search releases a failed response before returning its retryable error", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  await assert.rejects(searchNotionPages({ token: "synthetic", query: "", pageSize: 20 }, async () => new Response(body, { status: 429, headers: { "retry-after": "5" } })), (error: unknown) => {
    assert.ok(error instanceof Error && "retryable" in error && "retryAfterMs" in error);
    assert.equal(error.retryable, true);
    assert.equal(error.retryAfterMs, 5000);
    return true;
  });
  assert.equal(cancelled, true);
});

test("Notion mock never reads credentials, and live execution requires the workspace credential", async () => {
  const calls: unknown[][] = [];
  const credentials = { readForExecution: async (...args: unknown[]) => { calls.push(args); return { token: "secret" }; } } as unknown as CredentialService;
  const mock = await executeNotionSearch({ query: "hello", pageSize: 20 }, "mock", "workspace", credentials);
  assert.equal(mock.output.pages[0]?.title, "Example page");
  assert.equal(calls.length, 0);
  await assert.rejects(executeNotionSearch({ query: "hello" }, "live", "workspace", credentials), /Select a Notion connection/);
  const result = await executeNotionSearch({ credentialId: "connection", query: "hello" }, "live", "workspace", credentials, async (input) => { assert.equal(input.token, "secret"); return { pages: [], hasMore: false, nextCursor: null }; });
  assert.deepEqual(calls[0], ["connection", "workspace", "NOTION"]);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("PostgreSQL selection quotes identifiers and binds user values", () => {
  const query = buildPostgresSelect({ schema: "public", table: "orders", columns: ["name", "amount"], conditions: [{ column: "name", operator: "equals", value: "x' OR true --" }], limit: 10 });
  assert.equal(query.text, 'SELECT "name", "amount" FROM "public"."orders" WHERE "name" = $1 LIMIT 10');
  assert.deepEqual(query.values, ["x' OR true --"]);
});

test("PostgreSQL selection rejects unsafe numeric identifiers without rounding them into a query", async () => {
  const forbidden = { readForExecution: async () => { throw new Error("unexpected credential read"); } } as unknown as CredentialService;
  for (const mode of ["mock", "live"] as const) {
    for (const value of [Number.MAX_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER - 1]) {
      await assert.rejects(executePostgresSelect({ credentialId: "connection", schema: "public", table: "items", conditions: [{ column: "id", operator: "equals", value }] }, mode, "workspace", forbidden), /Use text for large integer identifiers/);
    }
  }
  const exact = "9007199254740993";
  const query = buildPostgresSelect({ schema: "public", table: "items", columns: [], conditions: [{ column: "id", operator: "equals", value: exact }], limit: 1 });
  assert.deepEqual(query.values, [exact]);
});

test("PostgreSQL selection rejects injected identifiers and unsupported operators", () => {
  assert.throws(() => buildPostgresSelect({ schema: "public", table: 'orders; DROP TABLE users', columns: [], conditions: [], limit: 20 }));
  assert.throws(() => buildPostgresSelect({ schema: "public", table: "orders", columns: [], conditions: [{ column: "name", operator: "constructor" as never, value: "x" }], limit: 20 }));
  assert.throws(() => buildPostgresSelect({ schema: "public", table: "orders", columns: [], conditions: [], limit: 101 }));
});

test("PostgreSQL selection binds conditions and validates ordered pagination", () => {
  const query = buildPostgresSelect({ schema: "public", table: "orders", columns: ["id", "amount"], conditions: [{ column: "status", operator: "equals", value: "pending' OR true --" }], orderBy: "id", orderDirection: "desc", offset: 20, limit: 10 });
  assert.equal(query.text, 'SELECT "id", "amount" FROM "public"."orders" WHERE "status" = $1 ORDER BY "id" DESC LIMIT 10 OFFSET 20');
  assert.deepEqual(query.values, ["pending' OR true --"]);
  assert.throws(() => buildPostgresSelect({ schema: "public", table: "orders", columns: [], conditions: [], offset: 1, limit: 10 }));
  assert.throws(() => buildPostgresSelect({ schema: "public", table: "orders", columns: [], conditions: [], orderBy: 'id; DROP TABLE orders', limit: 10 }));
  assert.throws(() => buildPostgresSelect({ schema: "public", table: "orders", columns: [], conditions: [], orderBy: "id", orderDirection: "desc; DROP" as never, limit: 10 }));
  assert.throws(() => buildPostgresSelect({ schema: "public", table: "orders", columns: ["id", "id"], conditions: [], limit: 10 }));
  assert.throws(() => buildPostgresSelect({ schema: "public", table: "orders", columns: [], conditions: [], orderDirection: "desc", limit: 10 }));
  assert.throws(() => buildPostgresSelect({ schema: "public", table: "orders", columns: [], conditions: [{ column: "id", operator: "equals", value: 1, unexpected: true } as never], limit: 10 }));
});

test("PostgreSQL targets reject private and mixed DNS results and preserve the TLS hostname", async () => {
  const resolve = (entries: Array<{ address: string; family: number }>) => (async () => entries) as unknown as typeof lookup;
  await assert.rejects(resolvePostgresTarget("localhost", resolve([{ address: "8.8.8.8", family: 4 }])), /public PostgreSQL hostname/);
  await assert.rejects(resolvePostgresTarget("db.example.com", resolve([{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }])), /not permitted/);
  assert.deepEqual(await resolvePostgresTarget("db.example.com", resolve([{ address: "8.8.8.8", family: 4 }])), { address: "8.8.8.8", servername: "db.example.com" });
});

test("PostgreSQL read pins the address, requires verified TLS and bounds streamed rows", async () => {
  const events: string[] = [];
  let configuration: Record<string, unknown> = {};
  let rows: unknown[] = [{ name: "example" }];
  const dependencies = {
    resolve: async () => ({ address: "8.8.8.8", servername: "db.example.com" }),
    createClient: (config: Record<string, unknown>) => {
      configuration = config;
      return { connect: async () => { events.push("connect"); }, query: (q: unknown) => typeof q === "string" ? (events.push(q), Promise.resolve()) : Readable.from(rows), end: async () => { events.push("end"); } };
    },
  } as unknown as NonNullable<Parameters<typeof readPostgresRows>[4]>;
  const credential = { host: "db.example.com", port: 5432, database: "test", username: "user", password: "secret" };
  assert.deepEqual(await readPostgresRows(credential, "public", "items", 20, dependencies), { rows: [{ name: "example" }], count: 1 });
  assert.equal(configuration.host, "8.8.8.8");
  assert.deepEqual(configuration.ssl, { servername: "db.example.com", rejectUnauthorized: true });
  assert.deepEqual(events, ["connect", "BEGIN READ ONLY", "end"]);
  rows = [{ text: "x".repeat(201_000) }];
  await assert.rejects(readPostgresRows(credential, "public", "items", 20, dependencies), /output size limit/);
  assert.equal(events.at(-1), "end");
});

test("PostgreSQL custom CA is bounded, validated and used without weakening TLS", async () => {
  const base = { host: "db.example.com", port: 5432, database: "test", username: "user", password: "secret" };
  const ca = rootCertificates[0]!;
  const privateKeyMarker = "-----BEGIN " + "PRIVATE KEY-----\nfixture\n-----END " + "PRIVATE KEY-----";
  assert.equal(validatePostgresCredential({ ...base, caCertificate: "" }).caCertificate, undefined);
  assert.equal(validatePostgresCredential({ ...base, caCertificate: `\n${ca}\n` }).caCertificate, ca.trim());
  for (const invalid of [null, 42, "not a certificate", `${ca}\n${privateKeyMarker}`, ca.repeat(5), "x".repeat(32_769)]) {
    assert.throws(() => validatePostgresCredential({ ...base, caCertificate: invalid }), /valid PostgreSQL CA certificate/);
  }
  let config: Record<string, unknown> = {};
  const dependencies = {
    resolve: async () => ({ address: "8.8.8.8", servername: "db.example.com" }),
    createClient: (value: Record<string, unknown>) => {
      config = value;
      return { connect: async () => {}, query: (q: unknown) => typeof q === "string" ? Promise.resolve() : Readable.from([]), end: async () => {} };
    },
  } as unknown as NonNullable<Parameters<typeof readPostgresRows>[4]>;
  await readPostgresRows({ ...base, caCertificate: ca }, "public", "items", 1, dependencies);
  const ssl = config.ssl as { servername: string; rejectUnauthorized: boolean; ca: string[] };
  assert.equal(ssl.servername, "db.example.com");
  assert.equal(ssl.rejectUnauthorized, true);
  assert.equal(ssl.ca.at(-1), ca.trim());
  assert.ok(ssl.ca.length > 1);
});

test("PostgreSQL mock does not read credentials and live selection uses its workspace credential", async () => {
  const calls: unknown[][] = [];
  const credentials = { readForExecution: async (...args: unknown[]) => { calls.push(args); return { host: "db.example.com", port: 5432, database: "sample", username: "user", password: "secret" }; } } as unknown as CredentialService;
  const config = { schema: "public", table: "items", limit: 10 };
  const mock = await executePostgresSelect(config, "mock", "workspace", credentials);
  assert.equal(mock.output.count, 1);
  assert.equal(calls.length, 0);
  await assert.rejects(executePostgresSelect(config, "live", "workspace", credentials), /Select a PostgreSQL connection/);
  const result = await executePostgresSelect({ ...config, credentialId: "connection" }, "live", "workspace", credentials, async (_credential, schema, table, limit) => { assert.deepEqual([schema, table, limit], ["public", "items", 10]); return { rows: [], count: 0 }; });
  assert.deepEqual(calls[0], ["connection", "workspace", "POSTGRES"]);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("PostgreSQL rejects unresolved selection expressions and unknown config before any read", async () => {
  let calls = 0;
  const forbidden = { readForExecution: async () => { calls++; throw new Error("unexpected credential read"); } } as unknown as CredentialService;
  const forbiddenRead = (async () => { calls++; throw new Error("unexpected database read"); }) as typeof readPostgresRows;
  const context = { steps: {} };
  for (const mode of ["mock", "live"] as const) {
    for (const key of ["columns", "conditions", "orderBy", "orderDirection", "offset", "limit"]) {
      const config = resolveExpressions({ credentialId: "connection", schema: "public", table: "items", [key]: "{{ steps.missing.output }}" }, context) as Record<string, unknown>;
      assert.equal(Object.hasOwn(config, key), true);
      assert.equal(config[key], undefined);
      await assert.rejects(executePostgresSelect(config, mode, "workspace", forbidden, forbiddenRead), /unresolved value/);
    }
    const nested = resolveExpressions({ schema: "public", table: "items", conditions: [{ column: "id", operator: "equals", value: "{{ steps.missing.output }}" }] }, context) as Record<string, unknown>;
    await assert.rejects(executePostgresSelect(nested, mode, "workspace", forbidden, forbiddenRead), /unresolved value/);
    for (const unknown of [{ filters: [] }, { conditons: [] }, { arbitrary: 1 }]) {
      await assert.rejects(executePostgresSelect({ schema: "public", table: "items", ...unknown }, mode, "workspace", forbidden, forbiddenRead), /unsupported field/);
    }
  }
  assert.equal(calls, 0);
  // Legacy nodes may omit all selection keys and retain common execution settings.
  const legacy = await executePostgresSelect({ schema: "public", table: "items", retryAttempts: 2, timeoutMs: 9000 }, "mock", "workspace", forbidden);
  assert.deepEqual(legacy.output.page, { limit: 20, offset: 0, completeness: "unknown" });
  assert.equal(legacy.output.returnedCount, 1);
});

test("PostgreSQL reports page completeness as unknown for live results", async () => {
  const credentials = { readForExecution: async () => ({ host: "db.example.com", port: 5432, database: "db", username: "user", password: "secret" }) } as unknown as CredentialService;
  const read = (async () => ({ rows: [{ id: 1 }, { id: 2 }], count: 2 })) as typeof readPostgresRows;
  const result = await executePostgresSelect({ schema: "public", table: "items", credentialId: "connection", limit: 2, orderBy: "id", offset: 10 }, "live", "workspace", credentials, read);
  assert.deepEqual(result.output, { rows: [{ id: 1 }, { id: 2 }], count: 2, returnedCount: 2, page: { limit: 2, offset: 10, completeness: "unknown" } });
});
