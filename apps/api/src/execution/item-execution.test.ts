import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionStatus } from "@prisma/client";
import type { WorkflowNode } from "@workflow/contracts";
import { ExecutionService } from "./execution.service";
import type { WorkflowItem } from "./item-stream";

for (const executeOnce of [false, true]) test(`a mock action processes ${executeOnce ? "only the first item" : "each item"} and records outcomes`, async () => {
  const records: Array<Record<string, unknown>> = [];
  const nodeUpdates: Array<Record<string, unknown>> = [];
  const transaction = {
    $queryRaw: async () => [{ status: ExecutionStatus.RUNNING, runToken: "run" }],
    nodeExecution: {
      findUniqueOrThrow: async () => ({ id: "node-execution" }),
      update: async ({ data }: { data: Record<string, unknown> }) => { nodeUpdates.push(data); },
    },
    nodeExecutionItem: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { records.push(...data); },
      update: async ({ where, data }: { where: { nodeExecutionId_itemIndex: { itemIndex: number } }; data: Record<string, unknown> }) => { Object.assign(records[where.nodeExecutionId_itemIndex.itemIndex]!, data); },
      updateMany: async () => ({ count: 0 }),
    },
  };
  const prisma = { $transaction: async (fn: (client: typeof transaction) => Promise<unknown>) => fn(transaction) };
  const service = new ExecutionService(prisma as never, {} as never, { publish: () => undefined } as never);
  const internals = service as unknown as {
    isCancelled: () => Promise<boolean>;
    renewLease: () => Promise<boolean>;
    runItemNode: (executionId: string, workspaceId: string, node: WorkflowNode, context: Record<string, unknown>, inputs: WorkflowItem[], mode: "mock", root: string, token: string, restored: ReadonlySet<string>) => Promise<{ result: { status: string }; items: WorkflowItem[] }>;
  };
  internals.isCancelled = async () => false;
  internals.renewLease = async () => true;
  const node: WorkflowNode = { id: "http", type: "action.http-request", position: { x: 0, y: 0 }, config: { url: "https://example.test/{{ $json.name }}", executeOnce } };
  const result = await internals.runItemNode("execution", "workspace", node, { trigger: {}, steps: {} }, [{ json: { name: "first" } }, { json: { name: "second" } }], "mock", "root", "run", new Set());
  assert.equal(result.result.status, "succeeded");
  assert.equal(result.items.length, executeOnce ? 1 : 2);
  assert.deepEqual(records.map((record) => record.status), executeOnce ? ["SUCCEEDED"] : ["SUCCEEDED", "SUCCEEDED"]);
  assert.deepEqual(records.map((record) => (record.input as { config: { url: string } }).config.url), executeOnce ? ["https://example.test/first"] : ["https://example.test/first", "https://example.test/second"]);
  assert.ok(nodeUpdates.some((update) => update.status === "SUCCEEDED"));
});

test("invalid run-once setting fails before any node or credential is used", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    { id: "send", type: "action.google-chat.webhook", position: { x: 1, y: 0 }, config: { message: "Test", executeOnce: "true" } },
  ], edges: [{ id: "edge", source: "manual", target: "send", kind: "success" }] };
  const execution = { id: "invalid-once", mode: "MOCK", status: ExecutionStatus.QUEUED, triggerData: {}, nodeExecutions: [], workflowVersion: { workflow: { workspaceId: "workspace" }, graph } };
  let transaction: unknown;
  const prisma = {
    execution: { findUnique: async () => execution, findUniqueOrThrow: async () => execution, updateMany: async ({ data }: { data: Record<string, unknown> }) => { updates.push(data); return { count: 1 }; } },
    nodeExecution: { upsert: async () => ({}), updateMany: async () => ({ count: 0 }), update: async () => { throw new Error("node must not run"); } },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(transaction),
  };
  transaction = { ...prisma, $queryRaw: async () => [{ status: ExecutionStatus.RUNNING, runToken: updates[0]?.runToken }] };
  const credentials = new Proxy({}, { get() { throw new Error("credential must not be used"); } });
  const service = new ExecutionService(prisma as never, credentials as never, { publish: () => undefined } as never);
  await service.run(execution.id, "mock");
  assert.equal(updates.at(-1)?.status, ExecutionStatus.FAILED);
  assert.equal(updates.at(-1)?.errorCode, "INVALID_CONFIGURATION");
});

test("an invalid item stops the action and marks remaining items skipped", async () => {
  const records: Array<Record<string, unknown>> = [];
  const transaction = {
    $queryRaw: async () => [{ status: ExecutionStatus.RUNNING, runToken: "run" }],
    nodeExecution: { findUniqueOrThrow: async () => ({ id: "node-execution" }), update: async () => ({}) },
    nodeExecutionItem: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { records.push(...data); },
      update: async ({ where, data }: { where: { nodeExecutionId_itemIndex: { itemIndex: number } }; data: Record<string, unknown> }) => { Object.assign(records[where.nodeExecutionId_itemIndex.itemIndex]!, data); },
      updateMany: async () => { for (const record of records) if (!record.status || record.status === "PENDING") record.status = "SKIPPED"; return { count: 1 }; },
    },
  };
  const service = new ExecutionService({ $transaction: async (fn: (client: typeof transaction) => Promise<unknown>) => fn(transaction) } as never, {} as never, { publish: () => undefined } as never);
  const internals = service as unknown as {
    isCancelled: () => Promise<boolean>; renewLease: () => Promise<boolean>;
    runItemNode: (executionId: string, workspaceId: string, node: WorkflowNode, context: Record<string, unknown>, inputs: WorkflowItem[], mode: "mock", root: string, token: string, restored: ReadonlySet<string>) => Promise<{ result: { status: string } }>;
  };
  internals.isCancelled = async () => false;
  internals.renewLease = async () => true;
  const node: WorkflowNode = { id: "http", type: "action.http-request", position: { x: 0, y: 0 }, config: { url: "{{ $json.url }}" } };
  const inputs = [{ json: { url: "https://example.test/one" } }, { json: { url: "invalid" } }, { json: { url: "https://example.test/three" } }];
  const result = await internals.runItemNode("execution", "workspace", node, { trigger: {}, steps: {} }, inputs, "mock", "root", "run", new Set());
  assert.equal(result.result.status, "failed");
  assert.deepEqual(records.map((record) => record.status), ["SUCCEEDED", "FAILED", "SKIPPED"]);
});
