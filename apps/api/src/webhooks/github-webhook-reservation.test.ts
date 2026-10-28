import { strict as assert } from "node:assert";
import { test } from "node:test";
import { reserveGitHubWebhook } from "./github-webhook-reservation";

function fixture() {
  let saved: Record<string, unknown> | undefined;
  const tx = {
    $queryRaw: async () => [{ id: "flow" }],
    workflow: { findFirst: async () => ({ id: "flow", workspaceId: "space", publishedVersion: { id: "version", graph: { nodes: [{ id: "trigger", type: "trigger.github.push", position: { x: 0, y: 0 }, config: { repository: "Owner/Repo", credentialId: "cred" } }], edges: [] } } }) },
    webhookEndpoint: { findFirst: async () => ({ id: "endpoint", path: "hook-path", workflowVersionId: "version", updatedAt: new Date("2026-01-01"), isActive: true, encryptedSigningSecret: "ciphertext" }) },
    credential: { findFirst: async () => ({ id: "cred" }) },
    providerWebhookRegistration: { create: async ({ data }: { data: Record<string, unknown> }) => { saved = data; return { id: "reservation", operationId: data.operationId }; } },
  };
  const prisma = { $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) };
  const input = { workflowId: "flow", userId: "owner", versionId: "version", endpointId: "endpoint", endpointUpdatedAt: new Date("2026-01-01"), apiOrigin: "https://api.example.invalid" };
  return { tx, prisma, input, saved: () => saved };
}

test("reserves pinned GitHub config with the endpoint's encrypted signing secret", async () => {
  const f = fixture();
  await reserveGitHubWebhook(f.prisma as never, f.input);
  assert.equal(f.saved()?.repository, "owner/repo");
  assert.equal(f.saved()?.event, "push");
  assert.equal(f.saved()?.callbackUrl, "https://api.example.invalid/webhooks/hook-path");
  assert.equal(f.saved()?.encryptedSigningSecret, "ciphertext");
  assert.equal(f.saved()?.state, "CREATING");
});

test("rejects stale versions, missing workspace credentials and unsafe callback origins", async () => {
  const f = fixture();
  await assert.rejects(() => reserveGitHubWebhook(f.prisma as never, { ...f.input, versionId: "stale" }));
  await assert.rejects(() => reserveGitHubWebhook(f.prisma as never, { ...f.input, endpointUpdatedAt: new Date("2025-01-01") }));
  await assert.rejects(() => reserveGitHubWebhook(f.prisma as never, { ...f.input, apiOrigin: "https://user:password@example.invalid" }));
  f.tx.credential.findFirst = async () => null as never;
  await assert.rejects(() => reserveGitHubWebhook(f.prisma as never, f.input));
  assert.equal(f.saved(), undefined);
});
