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

test("relational reads apply selections and reject unsupported fields", async () => {
  const config = { credentialId: "connection", schema: "public", table: "items", limit: 2, columns: ["name"], conditions: [{ column: "active", operator: "equals", value: true }], orderBy: "id", offset: 3 };
  let sql = "";
  const read: typeof readPostgresRows = async (_credential, schema, table, limit, _dependencies, selection) => {
    assert.ok(selection); sql = buildPostgresSelect({ schema, table, limit, ...selection }).text; return { rows: [], count: 0 };
  };
  await executePostgresSelect(config, "live", "workspace", pgCredentials, read);
  assert.equal(sql, 'SELECT "name" FROM "public"."items" WHERE "active" = $1 ORDER BY "id" ASC LIMIT 2 OFFSET 3');
  await assert.rejects(executePostgresSelect({ ...config, arbitrary: true }, "mock", "workspace", pgCredentials, read), /unsupported field/);
  const sb = { readForExecution: async () => ({ projectRef: "abcdefghijklmnopqrst", apiKey: "sb_synthetic" }) } as unknown as CredentialService;
  await executeSupabaseSelect({ credentialId: "connection", table: "items", columns: ["name"], filters: [{ column: "active", operator: "equals", value: true }], order: [{ column: "id", direction: "asc" }], offset: 2 }, "live", "workspace", sb, async (url) => {
    const params = new URL(url).searchParams; assert.equal(params.get("select"), "name"); assert.equal(params.get("active"), "eq.true"); assert.equal(params.get("order"), "id.asc"); assert.equal(params.get("offset"), "2"); return Response.json([]);
  });
  await assert.rejects(executeSupabaseSelect({ table: "items", arbitrary: true }, "mock", "workspace", sb), /unsupported field/);
});

test("new relational node types require the same owner-scoped credentials", async () => {
  const { liveCredentialRequirements } = await import("./live-readiness");
  const graph = { nodes: [
    { id: "pg", type: "action.postgres.select" as const, position: { x: 0, y: 0 }, config: { credentialId: "pg-connection" } },
    { id: "sb", type: "action.supabase.select" as const, position: { x: 1, y: 0 }, config: { credentialId: "sb-connection" } },
  ], edges: [] };
  assert.deepEqual(liveCredentialRequirements(graph), [
    { nodeId: "pg", provider: CredentialProvider.POSTGRES, credentialId: "pg-connection" },
    { nodeId: "sb", provider: CredentialProvider.SUPABASE, credentialId: "sb-connection" },
  ]);
});
