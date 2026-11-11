import assert from "node:assert/strict";
import test from "node:test";
import { WorkflowService } from "./workflow.service";

const graph = { nodes: [{ id: "mail", type: "trigger.gmail", position: { x: 0, y: 0 }, config: { credentialId: "gmail" } }], edges: [] };
const version = { id: "v1", version: 1, status: "PUBLISHED", graph };
const draft = { id: "v2", version: 2, status: "DRAFT", graph };
const baseWorkflow = { id: "flow", workspaceId: "space", name: "Example", description: null, archivedAt: null, isActive: false, activatedAt: null, draftVersion: draft, publishedVersion: version, createdAt: new Date(), updatedAt: new Date() };

test("reactivating a Gmail workflow preserves the saved history and rejects a changed mailbox", async () => {
  let updated: Record<string, unknown> | null = null;
  let mailbox = "same";
  const checkpoint = { state: "READY", mailboxHash: "same", historyId: "100", pageToken: "page" };
  const transaction = {
    $queryRaw: async () => [{ publishedVersionId: "v1", isActive: false, archivedAt: null }],
    gmailTriggerCheckpoint: { findUnique: async () => checkpoint, update: async ({ data }: { data: Record<string, unknown> }) => { updated = data; }, create: async () => { throw new Error("must preserve checkpoint"); } },
    workflow: { update: async () => ({ ...baseWorkflow, isActive: true }) },
    auditLog: { create: async () => ({}) },
  };
  const prisma = { workflow: { findFirst: async () => baseWorkflow }, $transaction: async (fn: (tx: typeof transaction) => Promise<unknown>) => fn(transaction) };
  const gmail = { baseline: async () => [{ nodeId: "mail", historyId: "999", mailboxHash: mailbox }] };
  const service = new WorkflowService(prisma as never, {} as never, gmail as never);
  await service.activate("flow", "owner");
  assert.deepEqual(updated, { leaseToken: null, leaseExpiresAt: null, nextPollAt: null });
  assert.equal(checkpoint.historyId, "100");
  mailbox = "different";
  await assert.rejects(service.activate("flow", "owner"), /different Gmail mailbox/);
});

test("activation of a legacy graph with a planned node stops before reading a Gmail baseline", async () => {
  const legacy = { ...baseWorkflow, publishedVersion: { ...version, graph: { nodes: [...graph.nodes, { id: "planned", type: "action.instagram", position: { x: 1, y: 0 }, config: {} }], edges: [] } } };
  let baselineCalls = 0;
  const service = new WorkflowService({ workflow: { findFirst: async () => legacy } } as never, {} as never, { baseline: async () => { baselineCalls++; return []; } } as never);
  await assert.rejects(() => service.activate("flow", "owner"), (error: any) => error.response?.code === "NODE_UNAVAILABLE");
  assert.equal(baselineCalls, 0);
});

test("changing a Gmail trigger requires acknowledgement before publishing", async () => {
  const changed = { nodes: [{ ...graph.nodes[0]!, config: { credentialId: "other" } }], edges: [] };
  const transaction = {
    $queryRaw: async () => [{ draftVersionId: "v2", publishedVersionId: "v1", isActive: false }],
    webhookEndpoint: { findMany: async () => [] },
    workflowVersion: { findUnique: async ({ where }: { where: { id: string } }) => where.id === "v1" ? version : { ...draft, graph: changed } },
    gmailTriggerCheckpoint: { findUnique: async () => ({ leaseToken: null, leaseExpiresAt: null }) },
  };
  const prisma = { workflow: { findFirst: async () => ({ ...baseWorkflow, draftVersion: { ...draft, graph: changed } }) }, $transaction: async (fn: (tx: typeof transaction) => Promise<unknown>) => fn(transaction) };
  const service = new WorkflowService(prisma as never, {} as never);
  await assert.rejects(service.publish("flow", "owner"), (error: unknown) => Boolean(error && typeof error === "object" && "getResponse" in error && typeof error.getResponse === "function" && (error.getResponse() as { code?: string }).code === "GMAIL_PUBLISH_GAP_CONFIRMATION"));
});

test("checkpoint reset requires explicit acknowledgement and cancels pending queued work", async () => {
  let audit: Record<string, unknown> | undefined;
  let cancelled: Record<string, unknown> | undefined;
  const transaction = {
    $queryRaw: async () => [{ publishedVersionId: "v1", isActive: false, archivedAt: null }],
    gmailTriggerCheckpoint: { findUnique: async () => ({ state: "ERROR" }), update: async () => ({}) },
    gmailTriggerDelivery: { findMany: async () => [{ executionId: "execution-1" }], updateMany: async () => ({ count: 1 }) },
    execution: { updateMany: async ({ where }: { where: Record<string, unknown> }) => { cancelled = where; return { count: 1 }; } },
    auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => { audit = data; } },
  };
  const prisma = { workflow: { findFirst: async () => baseWorkflow }, $transaction: async (fn: (tx: typeof transaction) => Promise<unknown>) => fn(transaction) };
  const gmail = { baseline: async () => [{ nodeId: "mail", historyId: "999", mailboxHash: "same" }] };
  const service = new WorkflowService(prisma as never, {} as never, gmail as never);
  await assert.rejects(service.resetGmailTrigger("flow", "owner", false), /Confirm/);
  assert.deepEqual(await service.resetGmailTrigger("flow", "owner", true), { success: true });
  assert.deepEqual(cancelled, { id: { in: ["execution-1"] }, status: "QUEUED" });
  assert.equal((audit as Record<string, unknown> | undefined)?.action, "workflow.gmail_checkpoint_reset");
});

test("reset targets one Gmail trigger without touching the other checkpoint", async () => {
  const multiGraph = { nodes: [graph.nodes[0]!, { ...graph.nodes[0]!, id: "mail-2", config: { credentialId: "gmail-2" } }], edges: [] };
  const selected: string[] = [];
  const changed: string[] = [];
  const tx = {
    $queryRaw: async () => [{ publishedVersionId: "v1", isActive: false, archivedAt: null }],
    gmailTriggerCheckpoint: { findUnique: async () => ({ state: "ERROR" }), update: async ({ where }: any) => { changed.push(where.workflowVersionId_nodeId.nodeId); } },
    gmailTriggerDelivery: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    auditLog: { create: async () => ({}) },
  };
  const prisma = { workflow: { findFirst: async () => ({ ...baseWorkflow, publishedVersion: { ...version, graph: multiGraph } }) }, $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) };
  const gmail = { baseline: async (_workspace: string, input: typeof multiGraph) => { selected.push(...input.nodes.filter((node) => node.type === "trigger.gmail").map((node) => node.id)); return [{ nodeId: "mail-2", historyId: "999", mailboxHash: "same" }]; } };
  const service = new WorkflowService(prisma as never, {} as never, gmail as never);
  await assert.rejects(service.resetGmailTrigger("flow", "owner", true), /Select the published trigger/);
  await service.resetGmailTrigger("flow", "owner", true, "mail-2");
  assert.deepEqual(selected, ["mail-2"]);
  assert.deepEqual(changed, ["mail-2"]);
});
