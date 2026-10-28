import { strict as assert } from "node:assert";
import { test } from "node:test";
import { WorkflowService } from "./workflow.service";

function fixture(managed: boolean, draftVersionId = "draft-1") {
  let writes = 0;
  const graph = { nodes: [{ id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} }], edges: [] };
  const transaction = {
    $queryRaw: async () => [{ draftVersionId }],
    providerWebhookRegistration: { findFirst: async () => managed ? { id: "reg" } : null },
    workflowVersion: { update: async () => { writes++; return {}; } },
  };
  const service = new WorkflowService({
    workflow: { findFirst: async () => ({ id: "flow", workspaceId: "space", draftVersion: { id: "draft-1", graph } }) },
    $transaction: async (fn: (tx: typeof transaction) => Promise<unknown>) => fn(transaction),
  } as never, {} as never);
  return { service, writes: () => writes };
}

test("publishing is blocked before any writes while a provider webhook exists", async () => {
  const f = fixture(true);
  await assert.rejects(() => f.service.publish("flow", "owner"), (error: any) => error.response?.code === "PROVIDER_WEBHOOK_MANAGED");
  assert.equal(f.writes(), 0);
});

test("publishing rejects a draft changed before the workflow lock", async () => {
  const f = fixture(false, "newer-draft");
  await assert.rejects(() => f.service.publish("flow", "owner"), (error: any) => error.response?.code === "WORKFLOW_DRAFT_CHANGED");
  assert.equal(f.writes(), 0);
});

test("publishing a workflow without a managed webhook remains available", async () => {
  const graph = { nodes: [{ id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} }], edges: [] };
  const version = { id: "draft-1", version: 1, status: "PUBLISHED", graph };
  const transaction = {
    $queryRaw: async () => [{ draftVersionId: "draft-1" }],
    providerWebhookRegistration: { findFirst: async () => null },
    workflowVersion: { findUnique: async () => ({ ...version, status: "DRAFT" }), update: async () => version, aggregate: async () => ({ _max: { version: 1 } }), create: async () => ({ id: "draft-2" }) },
    workflow: { update: async () => ({ id: "flow", workspaceId: "space", name: "test", description: null, archivedAt: null, isActive: false, activatedAt: null, draftVersion: null, publishedVersion: version, createdAt: new Date(), updatedAt: new Date() }) },
    auditLog: { create: async () => ({}) },
  };
  const service = new WorkflowService({ workflow: { findFirst: async () => ({ id: "flow", workspaceId: "space", draftVersion: { id: "draft-1", graph } }) }, $transaction: async (fn: (tx: typeof transaction) => Promise<unknown>) => fn(transaction) } as never, {} as never);
  assert.equal((await service.publish("flow", "owner")).published?.version, 1);
});

test("publish rereads the draft graph after acquiring the workflow lock", async () => {
  const oldGraph = { nodes: [{ id: "old", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} }], edges: [] };
  const latestGraph = { nodes: [{ id: "new", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} }], edges: [] };
  let cloned: unknown;
  const version = { id: "draft-1", version: 1, status: "PUBLISHED", graph: latestGraph };
  const tx = {
    $queryRaw: async () => [{ draftVersionId: "draft-1" }],
    providerWebhookRegistration: { findFirst: async () => null },
    workflowVersion: { findUnique: async () => ({ ...version, status: "DRAFT" }), update: async () => version, aggregate: async () => ({ _max: { version: 1 } }), create: async ({ data }: any) => { cloned = data.graph; return { id: "next" }; } },
    workflow: { update: async () => ({ id: "flow", workspaceId: "space", name: "test", description: null, archivedAt: null, isActive: false, activatedAt: null, draftVersion: null, publishedVersion: version, createdAt: new Date(), updatedAt: new Date() }) },
    auditLog: { create: async () => ({}) },
  };
  const service = new WorkflowService({ workflow: { findFirst: async () => ({ id: "flow", workspaceId: "space", draftVersion: { id: "draft-1", graph: oldGraph } }) }, $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } as never, {} as never);
  await service.publish("flow", "owner");
  assert.deepEqual(cloned, latestGraph);
});
