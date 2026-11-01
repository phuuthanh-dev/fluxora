import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { executeSupabaseSelect, listSupabaseTables } from "./supabase";

const credentials = { readForExecution: async (id: string, workspace: string, provider: CredentialProvider) => {
  assert.equal(id, "connection"); assert.equal(workspace, "workspace"); assert.equal(provider, CredentialProvider.SUPABASE);
  return { projectRef: "abcdefghijklmnopqrst", apiKey: "sb_secret_fixture" };
} } as unknown as CredentialService;

test("Supabase schema discovery returns safe table names and no functions", async () => {
  const result = await listSupabaseTables({ projectRef: "abcdefghijklmnopqrst", apiKey: "sb_secret_fixture" }, async (url, init) => {
    assert.equal(url, "https://abcdefghijklmnopqrst.supabase.co/rest/v1/");
    const headers = init.headers as Record<string, string>;
    assert.equal(headers.apikey, "sb_secret_fixture"); assert.equal(headers.authorization, undefined);
    return Response.json({ paths: { "/": { get: {} }, "/items": { get: {} }, "/rpc/change": { post: {} }, "/bad/name": { get: {} } } });
  });
  assert.deepEqual(result, { tables: [{ id: "items", name: "items" }], hasMore: false });
});

test("Supabase row read uses key header and bounded public table query", async () => {
  const result = await executeSupabaseSelect({ credentialId: "connection", table: "items", limit: 1 }, "live", "workspace", credentials, async (url, init) => {
    const parsed = new URL(url); assert.equal(parsed.pathname, "/rest/v1/items"); assert.equal(parsed.searchParams.get("limit"), "1");
    assert.equal((init.headers as Record<string, string>).apikey, "sb_secret_fixture");
    return Response.json([{ id: 1 }, { id: 2 }]);
  });
  assert.deepEqual(result.output, { rows: [{ id: 1 }], count: 1 });
  await assert.rejects(executeSupabaseSelect({ table: "../items" }, "mock", "workspace", credentials), /Choose a table/);
});

test("legacy JWT uses bearer authorization; invalid hosts and oversized data are rejected", async () => {
  await listSupabaseTables({ projectRef: "abcdefghijklmnopqrst", apiKey: "eyJfixture.abc.def" }, async (_url, init) => {
    assert.equal((init.headers as Record<string, string>).authorization, "Bearer eyJfixture.abc.def");
    return Response.json({ paths: {} });
  });
  await assert.rejects(listSupabaseTables({ projectRef: "evil.example", apiKey: "fixture" }, async () => { throw new Error("must not fetch"); }), /project reference/);
  await assert.rejects(executeSupabaseSelect({ credentialId: "connection", table: "items" }, "live", "workspace", credentials, async () => Response.json([{ body: "x".repeat(200_001) }])), /output size limit/);
});
