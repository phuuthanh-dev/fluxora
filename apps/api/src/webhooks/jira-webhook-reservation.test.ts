import { strict as assert } from "node:assert";
import { test } from "node:test";
import { reserveJiraWebhook } from "./jira-webhook-reservation";
import { jiraDeliveryToken } from "./jira-trigger-protocol";

function fixture() {
  let saved: Record<string, unknown> | undefined;
  const cloudId = "12345678-1234-1234-1234-123456789abc";
  const tx = {
    $queryRaw: async () => [{ id: "flow" }],
    workflow: { findFirst: async () => ({ id: "flow", workspaceId: "space", publishedVersion: { id: "version", graph: { nodes: [{ id: "trigger", type: "trigger.jira.issue", position: { x: 0, y: 0 }, config: { project: "10001", event: "jira:issue_created", credentialId: "cred" } }], edges: [] } } }) },
    webhookEndpoint: { findFirst: async () => ({ id: "endpoint", path: "hook-path", workflowVersionId: "version", updatedAt: new Date("2026-01-01"), isActive: true, encryptedSigningSecret: "ciphertext", secretHash: "hash" }) },
    credential: { findFirst: async () => ({ encryptedData: "cipher" }) },
    providerWebhookRegistration: { findUnique: async () => null, create: async ({ data }: { data: Record<string, unknown> }) => { saved = data; return { id: "reservation", operationId: data.operationId }; } },
  };
  const prisma = { $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) };
  const vault = { decrypt: () => ({ cloudId, grantedScopes: ["manage:jira-webhook"] }) };
  const input = { workflowId: "flow", userId: "owner", versionId: "version", endpointId: "endpoint", endpointUpdatedAt: new Date("2026-01-01"), apiOrigin: "https://api.example.invalid", clientSecret: "test-secret" };
  return { tx, prisma, vault, input, cloudId, saved: () => saved };
}

test("Jira reservation pins the published project, event and site", async () => {
  const f = fixture();
  await reserveJiraWebhook(f.prisma as never, f.vault as never, f.input);
  assert.equal(f.saved()?.repository, `${f.cloudId}:10001`);
  assert.equal(f.saved()?.event, "jira:issue_created");
  assert.equal(f.saved()?.callbackUrl, `https://api.example.invalid/api/v1/webhooks/hook-path?delivery=${jiraDeliveryToken("test-secret", "endpoint")}`);
  assert.equal(f.saved()?.state, "CREATING");
});

test("Jira reservation rejects stale versions, missing scope and unsafe origins", async () => {
  const f = fixture();
  await assert.rejects(() => reserveJiraWebhook(f.prisma as never, f.vault as never, { ...f.input, versionId: "stale" }));
  await assert.rejects(() => reserveJiraWebhook(f.prisma as never, f.vault as never, { ...f.input, apiOrigin: "http://localhost:3001" }));
  f.vault.decrypt = () => ({ cloudId: f.cloudId, grantedScopes: [] });
  await assert.rejects(() => reserveJiraWebhook(f.prisma as never, f.vault as never, f.input));
  assert.equal(f.saved(), undefined);
});
