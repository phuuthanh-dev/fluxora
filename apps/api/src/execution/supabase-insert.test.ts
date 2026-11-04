import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { resolveExpressions } from "./expression";
import { NodeFailure } from "./node-failure";
import { executeSupabaseInsert } from "./supabase";

const config = { credentialId: "connection", table: "items", fields: [
  { column: "name", type: "text", value: "Example" },
  { column: "count", type: "number", value: "12.5" },
  { column: "active", type: "boolean", value: "false" },
  { column: "note", type: "null", value: "" },
] };
const secret = "sb_publishable_fixture";
const credentials = { readForExecution: async (id: string, workspace: string, provider: CredentialProvider) => {
  assert.deepEqual([id, workspace, provider], ["connection", "workspace", CredentialProvider.SUPABASE]);
  return { projectRef: "abcdefghijklmnopqrst", apiKey: secret, userAccessToken: "aaa.bbb.ccc", managementToken: "not-used" };
} } as unknown as CredentialService;

test("one guided row uses scoped Data API identity and does not require read access or expose a provider body", async () => {
  let calls = 0;
  const output = await executeSupabaseInsert(config, "live", "workspace", credentials, async (url, init) => {
    calls++;
    assert.equal(url, "https://abcdefghijklmnopqrst.supabase.co/rest/v1/items");
    assert.equal(init.method, "POST");
    const headers = init.headers as Record<string, string>;
    assert.equal(headers.apikey, secret);
    assert.equal(headers.authorization, "Bearer aaa.bbb.ccc");
    assert.equal(headers.prefer, "return=minimal");
    assert.ok(!JSON.stringify(headers).includes("not-used"));
    assert.deepEqual(JSON.parse(String(init.body)), { name: "Example", count: 12.5, active: false, note: null });
    return new Response(null, { status: 201 });
  });
  assert.equal(calls, 1);
  assert.deepEqual(output.output, { accepted: true, table: "items" });
  assert.ok(!JSON.stringify(output).includes(secret));
});

test("invalid fields and unresolved expressions fail before credential or provider access", async () => {
  const noCredentials = { readForExecution: () => { throw new Error("credential access"); } } as unknown as CredentialService;
  const noNetwork = async () => { throw new Error("network access"); };
  const missing = resolveExpressions({ ...config, fields: [{ column: "id", type: "expression", value: "{{ steps.missing.output }}" }] }, { steps: {} }) as Record<string, unknown>;
  for (const input of [
    { ...config, table: "../private" }, { ...config, fields: [] }, { ...config, fields: [{ column: "x", type: "number", value: "9007199254740993" }] },
    { ...config, fields: [{ column: "constructor", type: "text", value: "x" }] },
    { ...config, fields: [{ column: "id", type: "text", value: "a" }, { column: "id", type: "text", value: "b" }] },
    { ...config, fields: [{ column: "active", type: "boolean", value: "maybe" }] },
    { ...config, extra: true }, missing,
  ]) await assert.rejects(() => executeSupabaseInsert(input, "live", "workspace", noCredentials, noNetwork), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT" && !error.retryable);
});

test("mock and dynamic scalar values never contact Supabase; live writes do not retry uncertain outcomes", async () => {
  const resolved = resolveExpressions({ ...config, fields: [{ column: "active", type: "expression", value: "{{ steps.trigger.output.value }}" }] }, { steps: { trigger: { output: { value: true } } } }) as Record<string, unknown>;
  const mock = await executeSupabaseInsert(resolved, "mock", "workspace", {} as CredentialService, async () => { throw new Error("network access"); });
  assert.equal(mock.output.accepted, true);
  for (const status of [301, 307, 408, 429, 500]) {
    let calls = 0;
    await assert.rejects(() => executeSupabaseInsert(resolved, "live", "workspace", credentials, async () => { calls++; return new Response(secret, { status }); }), (error: unknown) => error instanceof NodeFailure && error.code === "DELIVERY_UNCERTAIN" && !error.retryable && !error.message.includes(secret));
    assert.equal(calls, 1);
  }
  await assert.rejects(() => executeSupabaseInsert(resolved, "live", "workspace", credentials, async () => { throw new Error(secret); }), (error: unknown) => error instanceof NodeFailure && error.code === "DELIVERY_UNCERTAIN" && !error.retryable && !error.message.includes(secret));
  await assert.rejects(() => executeSupabaseInsert(resolved, "live", "workspace", credentials, async () => new Response(secret, { status: 403 })), (error: unknown) => error instanceof NodeFailure && error.code === "SUPABASE_WRITE_REJECTED" && !error.retryable && !error.message.includes(secret));
});
