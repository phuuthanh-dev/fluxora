import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { WebhookService, hashWebhookSecret } from "./webhook.service";
import { parseWorkflowGraph, validatePublishableGraph } from "../workflows/workflow-graph";

const secret = "synthetic-vercel-signing-secret";
const graph = { nodes: [{ id: "vercel", type: "trigger.vercel.deployment", position: { x: 0, y: 0 }, config: { event: "deployment.ready", team: "personal", project: "prj_example" } }], edges: [] };
const vault = { encrypt: (value: unknown) => JSON.stringify(value), decrypt: (value: string) => JSON.parse(value) };

test("Vercel registration stores its provider secret without returning it", async () => {
  let stored: Record<string, unknown> | undefined;
  const transaction = {
    $queryRaw: async () => [{ publishedVersionId: "version" }],
    webhookEndpoint: { findMany: async () => [], create: async ({ data }: { data: Record<string, unknown> }) => { stored = data; return { id: "endpoint", path: data.path, workflowVersionId: "version", createdAt: new Date(), updatedAt: new Date() }; } },
    auditLog: { create: async () => ({}) },
  };
  const prisma = { workflow: { findFirst: async () => ({ id: "workflow", workspaceId: "workspace", publishedVersion: { id: "version", graph } }) }, webhookEndpoint: { findFirst: async () => null }, $transaction: async (fn: (tx: typeof transaction) => Promise<unknown>) => fn(transaction) };
  const service = new WebhookService(prisma as never, {} as never, {} as never, {} as never, vault as never);
  const expected = { publishedVersionId: "version", endpoint: null };
  await assert.rejects(service.createEndpoint("workflow", "owner", "vercel-test", true, expected));
  const result = await service.createEndpoint("workflow", "owner", "vercel-test", true, expected, secret);
  assert.equal(result.secret, null);
  assert.ok(!JSON.stringify(result).includes(secret));
  assert.equal(stored?.secretHash, hashWebhookSecret(secret));
  assert.equal(vault.decrypt(stored?.encryptedSigningSecret as string).secret, secret);
});

test("Vercel ingress verifies raw bytes and dispatches only the selected project", async () => {
  validatePublishableGraph(parseWorkflowGraph(graph));
  const endpoint = { id: "endpoint", path: "vercel-test", workflowId: "workflow", workflowVersionId: "version", isActive: true, secretHash: hashWebhookSecret(secret), encryptedSigningSecret: vault.encrypt({ secret }), workflow: { workspaceId: "workspace", isActive: true, archivedAt: null }, workflowVersion: { graph } };
  const captured: unknown[] = [], jobs: unknown[] = [];
  const service = new WebhookService({ webhookEndpoint: { findUnique: async () => endpoint } } as never, { createVercelScheduledExecution: async (input: unknown) => { captured.push(input); return { id: "run", status: "QUEUED", startedAt: null }; } } as never, { ensureDispatched: async (job: unknown) => { jobs.push(job); } } as never, {} as never, vault as never);
  const body = (project: string) => Buffer.from(JSON.stringify({ id: "evt_example", type: "deployment.ready", payload: { team: { id: null }, project: { id: project }, deployment: { id: "dpl_example", meta: { sensitive: "not forwarded" } } } }));
  const sign = (value: Buffer) => createHmac("sha1", secret).update(value).digest("hex");
  const selected = body("prj_example"), other = body("prj_other");
  await assert.rejects(service.receive("vercel-test", undefined, {}, undefined, { rawBody: selected }, undefined, "bad-signature"));
  assert.deepEqual(await service.receive("vercel-test", undefined, {}, undefined, { rawBody: other }, undefined, sign(other)), { acknowledged: true });
  assert.deepEqual(await service.receive("vercel-test", undefined, {}, undefined, { rawBody: selected }, undefined, sign(selected)), { executionId: "run" });
  const echoed = Buffer.from(JSON.stringify({ id: secret, type: "deployment.ready", payload: { team: { id: null }, project: { id: "prj_example" }, deployment: { id: "dpl_example" } } }));
  await assert.rejects(service.receive("vercel-test", undefined, {}, undefined, { rawBody: echoed }, undefined, sign(echoed)), (error: unknown) => error instanceof Error && !error.message.includes(secret));
  assert.equal(captured.length, 1);
  assert.ok(!JSON.stringify(captured).includes(secret));
  assert.ok(!JSON.stringify(captured).includes("not forwarded"));
  assert.equal((captured[0] as { deliveryKey: string }).deliveryKey, "evt_example");
  assert.deepEqual(jobs, [{ executionId: "run", mode: "live", initialOnly: true }]);
});
