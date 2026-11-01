import assert from "node:assert/strict";
import test from "node:test";
import { WebhookService, hashWebhookSecret, normalizeUptimeKumaAlert } from "./webhook.service";

const graph = { nodes: [{ id: "kuma", type: "trigger.uptime-kuma.alert", position: { x: 0, y: 0 }, config: {} }], edges: [] };

test("Uptime Kuma endpoint always creates a secret, even if the client asks for none", async () => {
  let stored: Record<string, unknown> | undefined;
  const transaction = {
    $queryRaw: async () => [{ publishedVersionId: "version-1" }],
    webhookEndpoint: { findMany: async () => [], create: async ({ data }: { data: Record<string, unknown> }) => { stored = data; return { id: "endpoint", path: data.path, workflowVersionId: "version-1", createdAt: new Date(), updatedAt: new Date() }; } },
    auditLog: { create: async () => ({}) },
  };
  const service = new WebhookService({ workflow: { findFirst: async () => ({ id: "workflow", workspaceId: "workspace", publishedVersion: { id: "version-1", graph } }) }, webhookEndpoint: { findFirst: async () => null }, $transaction: async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction) } as never, {} as never, {} as never, {} as never);
  const result = await service.createEndpoint("workflow", "owner", "kuma", false, { publishedVersionId: "version-1", endpoint: null });
  assert.ok(result.secret);
  assert.equal(stored?.secretHash, hashWebhookSecret(result.secret));
  assert.equal(stored?.encryptedSigningSecret, null);
});

test("authenticated Kuma alert drops unrelated monitor fields before dispatch", async () => {
  let captured: unknown;
  const endpoint = { id: "endpoint", isActive: true, secretHash: hashWebhookSecret("fixture-secret"), encryptedSigningSecret: null, workflow: { workspaceId: "workspace", isActive: true, archivedAt: null }, workflowVersion: { graph }, workflowVersionId: "version-1" };
  const service = new WebhookService({ webhookEndpoint: { findUnique: async () => endpoint } } as never, { createScheduledExecution: async (_version: string, payload: unknown) => { captured = payload; return { id: "run" }; } } as never, { dispatch: async () => undefined } as never, {} as never);
  const payload = { msg: "Service down", monitor: { id: 4, name: "API", url: "https://private.example/?token=private" }, heartbeat: { status: 0, time: "2026-11-01", ping: 10, password: "private" } };
  await assert.rejects(service.receive("kuma", "wrong", payload));
  endpoint.workflow.isActive = false;
  assert.deepEqual(await service.receive("kuma", "fixture-secret", { msg: "Test", monitor: null, heartbeat: null }), { acknowledged: true });
  assert.equal(captured, undefined);
  await assert.rejects(service.receive("kuma", "fixture-secret", payload));
  endpoint.workflow.isActive = true;
  assert.deepEqual(await service.receive("kuma", "fixture-secret", payload), { executionId: "run" });
  assert.deepEqual(captured, { source: "uptime-kuma", monitor: { id: "4", name: "API" }, heartbeat: { status: 0, time: "2026-11-01", ping: 10 }, message: "Service down" });
  endpoint.secretHash = "";
  await assert.rejects(service.receive("kuma", undefined, payload));
});

test("Kuma setup test is acknowledged and malformed alerts are rejected", async () => {
  assert.deepEqual(normalizeUptimeKumaAlert({ msg: "Test", monitor: null, heartbeat: null }), { test: true });
  assert.throws(() => normalizeUptimeKumaAlert({ msg: "Malformed", monitor: { id: 1, name: "API" }, heartbeat: { status: "down" } }));
  assert.throws(() => normalizeUptimeKumaAlert({ msg: "Malformed", monitor: { id: "../bad", name: "API" }, heartbeat: { status: 0 } }));
});
