import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildPostgresWrite, writePostgresRow } from "./postgres-write";

const base = { schema: "public", table: "items", fields: [{ column: "id", type: "number", value: "42" }, { column: "title", type: "text", value: "Robert'); DROP TABLE items;--" }] };
const credential = { host: "db.example.com", port: 5432, database: "app", username: "app", password: "secret" };

test("PostgreSQL insert and upsert quote identifiers and bind values", () => {
  const insert = buildPostgresWrite(base, "insert");
  assert.equal(insert.text, 'INSERT INTO "public"."items" ("id", "title") VALUES ($1, $2)');
  assert.deepEqual(insert.values, [42, "Robert'); DROP TABLE items;--"]);
  const upsert = buildPostgresWrite({ ...base, conflictColumn: "id" }, "upsert");
  assert.equal(upsert.text, 'INSERT INTO "public"."items" ("id", "title") VALUES ($1, $2) ON CONFLICT ("id") DO UPDATE SET "title" = EXCLUDED."title"');
});

test("PostgreSQL write rejects malformed, unsafe and ambiguous values", () => {
  assert.throws(() => buildPostgresWrite({ ...base, table: 'items; DROP TABLE x' }, "insert"));
  assert.throws(() => buildPostgresWrite({ ...base, conflictColumn: "missing" }, "upsert"));
  assert.throws(() => buildPostgresWrite({ ...base, fields: [base.fields[0], base.fields[0]] }, "insert"));
  assert.throws(() => buildPostgresWrite({ ...base, fields: [{ column: "id", type: "number", value: "9007199254740993" }] }, "insert"));
  assert.throws(() => buildPostgresWrite({ ...base, fields: [{ column: "id", type: "expression", value: undefined }] }, "insert"));
});

test("PostgreSQL write pins host, uses verified TLS and never retries an uncertain write", async () => {
  const query = buildPostgresWrite(base, "insert");
  let calls = 0, closed = 0;
  const dependencies = {
    resolve: async () => ({ address: "203.0.113.4", servername: "db.example.com" }),
    createClient: (config: import("pg").ClientConfig) => {
      assert.equal(config.host, "203.0.113.4");
      assert.equal((config.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized, true);
      return { connect: async () => {}, query: async (text: string, values: unknown[]) => { calls++; assert.equal(text, query.text); assert.deepEqual(values, query.values); throw new Error("connection lost"); }, end: async () => { closed++; } };
    },
  };
  await assert.rejects(() => writePostgresRow(credential, query, dependencies), (error: { code?: string; retryable?: boolean }) => error.code === "DELIVERY_UNCERTAIN" && error.retryable === false);
  assert.equal(calls, 1); assert.equal(closed, 1);
});

test("PostgreSQL write mock validates input but does not read credentials or connect", async () => {
  const { executePostgresWrite } = await import("./postgres-write");
  const credentials = { readForExecution: async () => { throw new Error("mock accessed credential"); } };
  const result = await executePostgresWrite(base, "insert", "mock", "workspace", credentials as never);
  assert.deepEqual(result.output, { accepted: true, schema: "public", table: "items" });
  await assert.rejects(() => executePostgresWrite({ ...base, schema: "bad-schema!" }, "insert", "mock", "workspace", credentials as never));
});
