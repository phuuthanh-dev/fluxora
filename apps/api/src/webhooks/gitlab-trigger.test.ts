import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { normalizeGitLabEvent, verifyGitLabSignature } from "./gitlab-trigger-protocol";
import { WebhookService, hashWebhookSecret } from "./webhook.service";

const secret = `whsec_${Buffer.alloc(32, 7).toString("base64")}`;
const vault = { encrypt: (value: unknown) => JSON.stringify(value), decrypt: (value: string) => JSON.parse(value) };
const data = { object_kind: "pipeline", project: { id: 42, path_with_namespace: "team/project" }, object_attributes: { id: 10, status: "success", ref: "main", sha: "abc", variables: [{ key: "PRIVATE", value: "never-copy-ci-variables" }] } };
function signed(value: unknown = data, timestamp = String(Math.floor(Date.now() / 1000))) {
  const raw = Buffer.from(JSON.stringify(value));
  const headers = { event: "Pipeline Hook", id: "stable-delivery-id", timestamp, signature: `v1,${createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`stable-delivery-id.${timestamp}.`).update(raw).digest("base64")}` };
  return { raw, headers };
}

test("GitLab signature binds delivery ID, recent timestamp and exact body; normalization excludes CI variables", () => {
  const { raw, headers } = signed();
  assert.equal(verifyGitLabSignature(raw, headers, secret), true);
  assert.equal(verifyGitLabSignature(Buffer.concat([raw, Buffer.from(" ")]), headers, secret), false);
  assert.equal(verifyGitLabSignature(raw, { ...headers, id: "changed" }, secret), false);
  const old = signed(data, String(Math.floor(Date.now() / 1000) - 301));
  assert.equal(verifyGitLabSignature(old.raw, old.headers, secret), false);
  assert.equal(verifyGitLabSignature(raw, headers, "not-a-signing-token"), false);
  const output = normalizeGitLabEvent(raw, headers, "trigger.gitlab.pipeline", { project: 42, status: "success" });
  assert.equal(output?.projectId, 42); assert.ok(!JSON.stringify(output).includes("variables"));
  assert.equal(normalizeGitLabEvent(raw, headers, "trigger.gitlab.pipeline", { project: 43 }), null);
  assert.equal(normalizeGitLabEvent(raw, headers, "trigger.gitlab.pipeline", { project: 42, status: "failed" }), null);
  const mr = { object_kind: "merge_request", project: { id: 42 }, object_attributes: { id: 20, iid: 2, action: "open", title: "Change", state: "opened" } };
  assert.equal(normalizeGitLabEvent(Buffer.from(JSON.stringify(mr)), { ...headers, event: "Merge Request Hook" }, "trigger.gitlab.merge-request", { project: 42 })?.event, "merge_request");
});

test("GitLab ingress authenticates before dispatch and uses stable delivery IDs with the existing durable runner", async () => {
  const graph = { nodes: [{ id: "gitlab", type: "trigger.gitlab.pipeline", position: { x: 0, y: 0 }, config: { project: "42", status: "all", credentialId: "connection" } }], edges: [] };
  const endpoint = { id: "endpoint", path: "gitlab-test", workflowId: "workflow", workflowVersionId: "version", isActive: true, secretHash: hashWebhookSecret(secret), encryptedSigningSecret: vault.encrypt({ secret }), workflow: { workspaceId: "workspace", publishedVersionId: "version", isActive: true, archivedAt: null }, workflowVersion: { graph } };
  const captured: Array<Record<string, unknown>> = [], jobs: unknown[] = [];
  const service = new WebhookService({ webhookEndpoint: { findUnique: async () => endpoint } } as never, { createLegacyWebhookExecution: async (input: Record<string, unknown>) => { captured.push(input); return { id: "run", status: captured.length === 1 ? "QUEUED" : "SUCCEEDED", startedAt: captured.length === 1 ? null : new Date() }; } } as never, { ensureDispatched: async (job: unknown) => { jobs.push(job); } } as never, {} as never, vault as never);
  const { raw, headers } = signed();
  const receive = (signature = headers.signature) => service.receive("gitlab-test", undefined, data, undefined, { rawBody: raw }, undefined, undefined, undefined, undefined, undefined, {}, { ...headers, signature });
  await assert.rejects(receive("bad")); assert.equal(captured.length, 0);
  await receive(); await receive(); await service.onModuleDestroy();
  assert.equal(captured[0]?.idempotencyKey, "webhook:endpoint:gitlab:stable-delivery-id");
  assert.equal(captured[1]?.idempotencyKey, captured[0]?.idempotencyKey);
  assert.equal(jobs.length, 1); assert.ok(!JSON.stringify(captured[0]?.payload).includes("never-copy"));
  endpoint.workflow.publishedVersionId = "different-version";
  await assert.rejects(receive()); assert.equal(captured.length, 2);
});

test("GitLab registration stores an imported signing token encrypted and never returns it", async () => {
  let saved: Record<string, unknown> = {};
  const graph = { nodes: [{ id: "gitlab", type: "trigger.gitlab.pipeline", position: { x: 0, y: 0 }, config: { project: "42", status: "all" } }], edges: [] };
  const prisma = {
    workflow: { findFirst: async () => ({ id: "workflow", workspaceId: "workspace", publishedVersion: { id: "version", graph } }) },
    webhookEndpoint: { findFirst: async () => null },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({
      $queryRaw: async () => [{ publishedVersionId: "version" }],
      webhookEndpoint: { findMany: async () => [], create: async ({ data: input }: { data: Record<string, unknown> }) => { saved = input; return { ...input, id: "endpoint", createdAt: new Date(), updatedAt: new Date() }; } },
      auditLog: { create: async () => ({}) },
    }),
  };
  const service = new WebhookService(prisma as never, {} as never, {} as never, {} as never, vault as never);
  const expected = { publishedVersionId: "version", endpoint: null };
  await assert.rejects(service.createEndpoint("workflow", "owner", "gitlab-test", true, expected, "old-secret-token"));
  const result = await service.createEndpoint("workflow", "owner", "gitlab-test", true, expected, secret);
  assert.equal(result.secret, null);
  assert.equal(vault.decrypt(saved.encryptedSigningSecret as string).secret, secret);
  assert.ok(!JSON.stringify(result).includes(secret));
});
