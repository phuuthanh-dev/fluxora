import assert from "node:assert/strict";
import test from "node:test";
import type { CredentialService } from "../credentials/credential.service";
import { executeGoogleDocs } from "./google-docs";

const credentials = { readGoogleForExecution: async () => ({ accessToken: "test-token" }) } as unknown as CredentialService;

test("Google Docs creates blank documents and selects or updates a document", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const transport = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Response.json(url.includes(":batchUpdate") ? { documentId: "doc-1", replies: [] } : { documentId: "doc-1", title: "Report", body: { content: [] } });
  };
  const base = { credentialId: "connection" };
  await executeGoogleDocs({ ...base, title: "Report" }, "create", "live", "workspace", credentials, transport);
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), { title: "Report" });
  const read = await executeGoogleDocs({ ...base, documentId: "doc-1" }, "get", "live", "workspace", credentials, transport);
  assert.ok("document" in read.output);
  await executeGoogleDocs({ ...base, documentId: "doc-1", operation: "replace", find: "before", text: "after" }, "update", "live", "workspace", credentials, transport);
  assert.deepEqual(JSON.parse(String(calls[2]?.init.body)), { requests: [{ replaceAllText: { containsText: { text: "before", matchCase: true }, replaceText: "after" } }] });
  await executeGoogleDocs({ ...base, documentId: "doc-1", operation: "append", text: "end" }, "update", "live", "workspace", credentials, transport);
  assert.deepEqual(JSON.parse(String(calls[3]?.init.body)), { requests: [{ insertText: { endOfSegmentLocation: {}, text: "end" } }] });
});

test("Google Docs never retries uncertain writes and validates provider responses", async () => {
  const base = { credentialId: "connection", documentId: "doc-1" };
  await assert.rejects(executeGoogleDocs({ ...base, operation: "append", text: "x" }, "update", "live", "workspace", credentials, async () => { throw new Error("timeout"); }), { code: "DELIVERY_UNCERTAIN" });
  await assert.rejects(executeGoogleDocs(base, "get", "live", "workspace", credentials, async () => Response.json({ documentId: "other" })), { code: "INVALID_PROVIDER_RESPONSE" });
  await assert.rejects(executeGoogleDocs({ ...base, operation: "replace", find: "", text: "x" }, "update", "live", "workspace", credentials), { code: "INVALID_INPUT" });
  const mock = await executeGoogleDocs({ ...base, operation: "append", text: "x" }, "update", "mock", "workspace", credentials);
  assert.equal(mock.status, "succeeded");
});
