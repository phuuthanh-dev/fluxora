import assert from "node:assert/strict";
import test from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { parseWorkflowGraph } from "../workflows/workflow-graph";
import { executePostgresSelect, readPostgresRows } from "./postgres-read";
import { executeSupabaseSelect } from "./supabase";
import { buildPostgresSelect } from "./postgres-select-query";

const pgCredential = { host: "db.example.test", port: 5432, database: "fixture", username: "fixture", password: "synthetic" };
const pgCredentials = { readForExecution: async (id: string, workspace: string, provider: CredentialProvider) => {
  assert.deepEqual([id, workspace, provider], ["connection", "workspace", CredentialProvider.POSTGRES]); return pgCredential;
} } as unknown as CredentialService;
const sbCredentials = { readForExecution: async (id: string, workspace: string, provider: CredentialProvider) => {
  assert.deepEqual([id, workspace, provider], ["connection", "workspace", CredentialProvider.SUPABASE]);
  return { projectRef: "abcdefghijklmnopqrst", apiKey: "eyJ.fixture.key", userAccessToken: "bad previously ignored value" };
} } as unknown as CredentialService;

for (const version of [undefined, 1] as const) {
  test(`PostgreSQL v${version ?? "unversioned"} ignores historical selection and arbitrary fields`, async () => {
    const config = { credentialId: "connection", schema: "public", table: "items", limit: 2, columns: ["name"], conditions: [{ column: "active", operator: "equals", value: false }], orderBy: "id", offset: 100, unexplained: { nested: null } };
    let reads = 0;
    const read: typeof readPostgresRows = async (_credential, schema, table, limit, _dependencies, selection) => {
      reads++; assert.equal(selection, undefined);
      assert.deepEqual(buildPostgresSelect({ schema, table, limit, columns: [], conditions: [] }), { text: 'SELECT * FROM "public"."items" LIMIT 2', values: [] });
      return { rows: [{ id: 1, name: "all" }], count: 1 };
    };
    const result = await executePostgresSelect(config, "live", "workspace", pgCredentials, read, version);
    assert.deepEqual(result.output, { rows: [{ id: 1, name: "all" }], count: 1 });
    assert.equal(reads, 1);
    const mock = await executePostgresSelect({ ...config, columns: undefined, conditions: null, offset: "bad", limit: undefined }, "mock", "workspace", pgCredentials, read, version);
    assert.deepEqual(mock.output, { rows: [{ example: true }], count: 1 });
  });

  test(`Supabase v${version ?? "unversioned"} keeps select=* and legacy bearer identity`, async () => {
    const config = { credentialId: "connection", table: "items", limit: 2, columns: ["name"], filters: [{ column: "active", operator: "equals", value: false }], order: [{ column: "id", direction: "desc" }], offset: 7, unknown: "ignored" };
    let requests = 0;
    const result = await executeSupabaseSelect(config, "live", "workspace", sbCredentials, async (url, init) => {
      requests++; const parsed = new URL(url);
      assert.deepEqual([...parsed.searchParams.entries()], [["select", "*"], ["limit", "2"]]);
      assert.equal((init.headers as Record<string, string>).authorization, "Bearer eyJ.fixture.key");
      return Response.json([{ id: 1, name: "all" }]);
    }, version);
    assert.deepEqual(result.output, { rows: [{ id: 1, name: "all" }], count: 1 });
    assert.equal(requests, 1);
    const mock = await executeSupabaseSelect({ ...config, filters: null, columns: undefined, offset: "bad", limit: undefined }, "mock", "workspace", sbCredentials, undefined, version);
    assert.deepEqual(mock.output, { rows: [{ example: true }], count: 1 });
  });
}

test("v2 applies selections, rejects unsupported fields and validates versions", async () => {
  const config = { credentialId: "connection", schema: "public", table: "items", limit: 2, columns: ["name"], conditions: [{ column: "active", operator: "equals", value: true }], orderBy: "id", offset: 3 };
  let sql = "";
  const read: typeof readPostgresRows = async (_credential, schema, table, limit, _dependencies, selection) => {
    assert.ok(selection); sql = buildPostgresSelect({ schema, table, limit, ...selection }).text; return { rows: [], count: 0 };
  };
  await executePostgresSelect(config, "live", "workspace", pgCredentials, read, 2);
  assert.equal(sql, 'SELECT "name" FROM "public"."items" WHERE "active" = $1 ORDER BY "id" ASC LIMIT 2 OFFSET 3');
  await assert.rejects(executePostgresSelect({ ...config, arbitrary: true }, "mock", "workspace", pgCredentials, read, 2), /unsupported field/);
  await assert.rejects(executePostgresSelect(config, "mock", "workspace", pgCredentials, read, 3), /version/);
  const sb = { readForExecution: async () => ({ projectRef: "abcdefghijklmnopqrst", apiKey: "sb_synthetic" }) } as unknown as CredentialService;
  await executeSupabaseSelect({ credentialId: "connection", table: "items", columns: ["name"], filters: [{ column: "active", operator: "equals", value: true }], order: [{ column: "id", direction: "asc" }], offset: 2 }, "live", "workspace", sb, async (url) => {
    const params = new URL(url).searchParams; assert.equal(params.get("select"), "name"); assert.equal(params.get("active"), "eq.true"); assert.equal(params.get("order"), "id.asc"); assert.equal(params.get("offset"), "2"); return Response.json([]);
  }, 2);
  await assert.rejects(executeSupabaseSelect({ table: "items", arbitrary: true }, "mock", "workspace", sb, undefined, 2), /unsupported field/);
});

test("distinct selection types preserve legacy graphs and reject unknown versions", () => {
  for (const type of ["action.postgres.select", "action.supabase.select"] as const) {
    const legacy = { nodes: [{ id: "read", type, position: { x: 0, y: 0 }, config: { table: "items", columns: ["id"], extra: true } }], edges: [] };
    assert.deepEqual(parseWorkflowGraph(legacy), legacy);
    const v2 = { ...legacy, nodes: [{ ...legacy.nodes[0]!, type: `${type}.v2`, nodeVersion: 1 }] };
    assert.deepEqual(parseWorkflowGraph(v2), v2);
    assert.throws(() => parseWorkflowGraph({ ...legacy, nodes: [{ ...legacy.nodes[0]!, nodeVersion: 2 }] }));
    assert.throws(() => parseWorkflowGraph({ ...legacy, nodes: [{ ...legacy.nodes[0]!, nodeVersion: 3 }] }));
  }
  assert.throws(() => parseWorkflowGraph({ nodes: [{ id: "trigger", type: "trigger.manual", nodeVersion: 2, position: { x: 0, y: 0 }, config: {} }], edges: [] }));
});

test("new relational node types require the same owner-scoped credentials", async () => {
  const { liveCredentialRequirements } = await import("./live-readiness");
  const graph = { nodes: [
    { id: "pg", type: "action.postgres.select.v2" as const, position: { x: 0, y: 0 }, config: { credentialId: "pg-connection" } },
    { id: "sb", type: "action.supabase.select.v2" as const, position: { x: 1, y: 0 }, config: { credentialId: "sb-connection" } },
  ], edges: [] };
  assert.deepEqual(liveCredentialRequirements(graph), [
    { nodeId: "pg", provider: CredentialProvider.POSTGRES, credentialId: "pg-connection" },
    { nodeId: "sb", provider: CredentialProvider.SUPABASE, credentialId: "sb-connection" },
  ]);
});
