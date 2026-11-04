import assert from "node:assert/strict";
import test from "node:test";
import { WebhookService, hashWebhookSecret, normalizeUptimeKumaAlert } from "./webhook.service";
import { parseWorkflowGraph, validatePublishableGraph } from "../workflows/workflow-graph";

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
  const storedGraph = { ...graph, nodes: [...graph.nodes, { id: "read", type: "action.supabase.select", nodeVersion: 2, position: { x: 200, y: 0 }, config: { table: "items" } }] };
  const endpoint = { id: "endpoint", isActive: true, secretHash: hashWebhookSecret("fixture-secret"), encryptedSigningSecret: null, workflow: { workspaceId: "workspace", isActive: true, archivedAt: null }, workflowVersion: { graph: storedGraph }, workflowVersionId: "version-1" };
  const service = new WebhookService({ webhookEndpoint: { findUnique: async () => endpoint } } as never, { createLegacyWebhookExecution: async ({ payload }: { payload: unknown }) => { captured = payload; return { id: "run", status: "QUEUED", startedAt: null }; } } as never, { ensureDispatched: async () => undefined } as never, {} as never);
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

test("Kuma v2 filters authenticated alerts without changing legacy trigger behavior", async () => {
  let created = 0;
  const node = { id: "kuma", type: "trigger.uptime-kuma.alert.v2", position: { x: 0, y: 0 }, config: { monitorId: "4", statusFilter: "0" } };
  const v2Graph = { nodes: [node], edges: [] };
  const endpoint = { id: "endpoint", path: "kuma", workflowId: "workflow", isActive: true, secretHash: hashWebhookSecret("fixture-secret"), encryptedSigningSecret: null, workflow: { workspaceId: "workspace", isActive: true, archivedAt: null }, workflowVersion: { graph: v2Graph }, workflowVersionId: "version-1" };
  const jobs: unknown[] = [];
  const service = new WebhookService({ webhookEndpoint: { findUnique: async () => endpoint } } as never, { createLegacyWebhookExecution: async () => { created++; return { id: "run", status: "QUEUED", startedAt: null }; }, createKumaScheduledExecution: async () => { created++; return { id: "run", status: "QUEUED", startedAt: null }; } } as never, { dispatch: async () => undefined, ensureDispatched: async (job: unknown) => { jobs.push(job); } } as never, {} as never);
  const alert = (monitorId: number, status: number) => ({ msg: "Alert", monitor: { id: monitorId, name: "API" }, heartbeat: { status } });
  validatePublishableGraph(parseWorkflowGraph(v2Graph));
  await assert.rejects(service.receive("kuma", "wrong", alert(5, 0)));
  assert.deepEqual(await service.receive("kuma", "fixture-secret", alert(5, 0)), { acknowledged: true });
  assert.deepEqual(await service.receive("kuma", "fixture-secret", alert(4, 1)), { acknowledged: true });
  assert.equal(created, 0);
  assert.deepEqual(await service.receive("kuma", "fixture-secret", alert(4, 0)), { executionId: "run" });
  assert.equal(created, 1);
  assert.deepEqual(jobs, [{ executionId: "run", mode: "live", initialOnly: true }]);
  endpoint.workflowVersion.graph = { nodes: [{ ...node, type: "trigger.uptime-kuma.alert" }], edges: [] };
  await service.receive("kuma", "fixture-secret", alert(5, 1));
  assert.equal(created, 2);
  assert.throws(() => validatePublishableGraph(parseWorkflowGraph({ nodes: [{ ...node, config: { statusFilter: "bogus" } }], edges: [] })));
});

test("a repeated Kuma delivery does not enqueue an execution already in progress or resumed", async () => {
  const graph = { nodes: [{ id: "kuma", type: "trigger.uptime-kuma.alert.v2", position: { x: 0, y: 0 }, config: {} }], edges: [] };
  const endpoint = { id: "endpoint", path: "kuma", workflowId: "workflow", isActive: true, secretHash: hashWebhookSecret("fixture-secret"), workflow: { workspaceId: "workspace", isActive: true, archivedAt: null }, workflowVersion: { graph }, workflowVersionId: "version" };
  let queued = 0;
  const alert = { msg: "Alert", monitor: { id: 1, name: "API" }, heartbeat: { status: 0 } };
  for (const state of [{ status: "RUNNING", startedAt: new Date() }, { status: "QUEUED", startedAt: new Date() }, { status: "SUCCEEDED", startedAt: new Date() }]) {
    const service = new WebhookService({ webhookEndpoint: { findUnique: async () => endpoint } } as never, { createKumaScheduledExecution: async () => ({ id: "run", ...state }) } as never, { ensureDispatched: async () => { queued++; } } as never, {} as never);
    assert.deepEqual(await service.receive("kuma", "fixture-secret", alert, "delivery"), { executionId: "run" });
  }
  assert.equal(queued, 0);
});
