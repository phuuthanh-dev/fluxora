import test from "node:test";
import assert from "node:assert/strict";
import { executeNotionSearch, searchNotionPages } from "./notion-search";
import type { CredentialService } from "../credentials/credential.service";
import { buildPostgresSelect } from "./postgres-select-query";
import { resolvePostgresTarget } from "./postgres-target";
import type { lookup } from "node:dns/promises";
import { Readable } from "node:stream";
import { executePostgresSelect, readPostgresRows } from "./postgres-read";

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

test("PostgreSQL selection rejects injected identifiers and unsupported operators", () => {
  assert.throws(() => buildPostgresSelect({ schema: "public", table: 'orders; DROP TABLE users', columns: [], conditions: [], limit: 20 }));
  assert.throws(() => buildPostgresSelect({ schema: "public", table: "orders", columns: [], conditions: [{ column: "name", operator: "constructor" as never, value: "x" }], limit: 20 }));
  assert.throws(() => buildPostgresSelect({ schema: "public", table: "orders", columns: [], conditions: [], limit: 101 }));
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
