import { strict as assert } from "node:assert";
import { test } from "node:test";
import { JiraWebhookRenewalService } from "./jira-webhook-renewal.service";

function fixture() {
  const cloudId = "12345678-1234-1234-1234-123456789abc";
  const registration = { id: "reg", remoteHookId: 42n, repository: `${cloudId}:10001`, callbackUrl: "https://example.invalid/webhooks/one", event: "jira:issue_created", credentialId: "cred", workflowVersionId: "version", endpoint: { workflow: { workspaceId: "space", publishedVersionId: "version", archivedAt: null } } };
  let updated = false, refreshed = false;
  const tx = { $queryRaw: async () => [{ id: "reg" }], providerWebhookRegistration: { findFirst: async () => registration, update: async () => { updated = true; } } };
  const prisma = { providerWebhookRegistration: { findMany: async () => [{ id: "reg" }] }, $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) };
  const credentials = { readForExecution: async () => ({ cloudId, accessToken: "synthetic-token" }), runJiraOperation: async (_id: string, _workspace: string, operation: () => Promise<void>) => operation() };
  const adapter = { inspect: async () => ({ found: true, matches: true }), refresh: async () => { refreshed = true; } };
  const service = new JiraWebhookRenewalService(prisma as never, credentials as never, adapter as never);
  return { service, adapter, updated: () => updated, refreshed: () => refreshed };
}

test("Jira renewal verifies the pinned identity before extending its lifetime", async () => {
  const f = fixture();
  await f.service.renewDue(new Date("2026-11-10T00:00:00Z"));
  assert.equal(f.refreshed(), true);
  assert.equal(f.updated(), true);
});

test("Jira renewal leaves changed remote webhooks untouched", async () => {
  const f = fixture();
  f.adapter.inspect = async () => ({ found: true, matches: false });
  await f.service.renewDue(new Date("2026-11-10T00:00:00Z"));
  assert.equal(f.refreshed(), false);
  assert.equal(f.updated(), false);
});
