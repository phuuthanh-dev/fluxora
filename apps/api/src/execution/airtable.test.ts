import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { CredentialService } from "../credentials/credential.service";
import { executeAirtable } from "./airtable";

const base = "app12345678901234", table = "tbl12345678901234", record = "rec12345678901234";
const token = "synthetic-airtable-secret";
const credentials = { airtableAccessToken: async (id: string, workspace: string) => { assert.equal(id, "connection"); assert.equal(workspace, "workspace"); return token; } } as unknown as CredentialService;
const config = { credentialId: "connection", baseId: base, tableId: table, recordId: record };

test("Airtable list and get use the selected connection without leaking its token", async () => {
  const read = async (url: string, init: RequestInit) => {
    assert.ok(!url.includes(token));
    assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${token}`);
    return url.includes("pageSize=") ? Response.json({ records: [{ id: record, fields: { Name: "Example" } }], offset: "next-page" }) : Response.json({ id: record, fields: { Name: "Example" } });
  };
  const list = await executeAirtable({ ...config, pageSize: 10 }, "list-records", "live", "workspace", credentials, read);
  const get = await executeAirtable(config, "get-record", "live", "workspace", credentials, read);
  assert.equal(list.output.hasMore, true);
  assert.equal(list.output.nextCursor, "next-page");
  assert.equal(get.output.record?.id, record);
  assert.ok(!JSON.stringify([list, get]).includes(token));
});

test("Airtable writes validate field values and never retry uncertain outcomes", async () => {
  const fields = [{ column: "fld12345678901234", type: "text", value: "Example" }];
  let writes = 0;
  const write = async (_url: string, init: RequestInit) => { writes++; assert.deepEqual(JSON.parse(String(init.body)), { fields: { fld12345678901234: "Example" } }); return Response.json({ id: record, fields: { Name: "Example" } }); };
  const created = await executeAirtable({ ...config, fields }, "create-record", "live", "workspace", credentials, undefined, write);
  assert.equal(created.output.record?.id, record);
  assert.equal(writes, 1);
  for (const response of [new Response("", { status: 500 }), Response.json({ invalid: true }), Response.json({ id: record, fields: { Name: token } })]) {
    await assert.rejects(executeAirtable({ ...config, fields }, "update-record", "live", "workspace", credentials, undefined, async () => response), (error: unknown) => (error as { code: string; retryable: boolean }).code === "DELIVERY_UNCERTAIN" && !(error as { retryable: boolean }).retryable && !String(error).includes(token));
  }
  await assert.rejects(executeAirtable({ ...config, fields: [{ column: "Name", type: "number", value: "0.1234567890123456789" }] }, "create-record", "live", "workspace", credentials), /supported field value/);
});

test("Airtable mock does not access credentials", async () => {
  const mock = { airtableAccessToken: () => { throw new Error("unexpected credential read"); } } as unknown as CredentialService;
  const result = await executeAirtable(config, "get-record", "mock", "workspace", mock);
  assert.equal(result.output.record?.id, record);
});
