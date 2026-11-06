import assert from "node:assert/strict";
import test from "node:test";
import { ExecutionStatus } from "@prisma/client";
import type { WorkflowNode } from "@workflow/contracts";
import { executeNode, ExecutionService } from "./execution.service";
import type { WorkflowItem } from "./item-stream";

test("run-once is a runner setting, not a PostgreSQL or Supabase provider field", async () => {
  const examples = [
    { type: "action.postgres.select", config: { schema: "public", table: "items" } },
    { type: "action.supabase.select", config: { table: "items" } },
    { type: "action.supabase.insert-row", config: { table: "items", fields: [{ column: "name", type: "text", value: "sample" }] } },
  ] as const;
  for (const example of examples) {
    const config = { ...example.config, executeOnce: true };
    const node: WorkflowNode = { id: "test", type: example.type, position: { x: 0, y: 0 }, config };
    assert.equal((await executeNode(node, config, {}, "mock", "workspace", {} as never, "execution")).status, "succeeded");
    assert.equal(config.executeOnce, true);
    await assert.rejects(() => executeNode(node, { ...config, executeOnce: "yes" }, {}, "mock", "workspace", {} as never, "execution"), { code: "INVALID_CONFIGURATION" });
    await assert.rejects(() => executeNode(node, { ...config, unexpected: true }, {}, "mock", "workspace", {} as never, "execution"));
  }
});

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

for (const type of ["condition.if", "condition.switch"] as const) test(`${type} routes each input item without replacing its data`, async () => {
  const records: Array<Record<string, unknown>> = [];
  const transaction = {
    $queryRaw: async () => [{ status: ExecutionStatus.RUNNING, runToken: "run" }],
    nodeExecution: { findUniqueOrThrow: async () => ({ id: "condition-execution" }), update: async () => ({}) },
    nodeExecutionItem: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { records.push(...data); },
      update: async ({ where, data }: { where: { nodeExecutionId_itemIndex: { itemIndex: number } }; data: Record<string, unknown> }) => { Object.assign(records[where.nodeExecutionId_itemIndex.itemIndex]!, data); },
      updateMany: async () => ({ count: 0 }),
    },
  };
  const service = new ExecutionService({ $transaction: async (fn: (client: typeof transaction) => Promise<unknown>) => fn(transaction) } as never, {} as never, { publish: () => undefined } as never);
  const internals = service as unknown as {
    isCancelled: () => Promise<boolean>; renewLease: () => Promise<boolean>;
    runItemNode: (executionId: string, workspaceId: string, node: WorkflowNode, context: Record<string, unknown>, inputs: WorkflowItem[], mode: "mock", root: string, token: string, restored: ReadonlySet<string>) => Promise<{ result: { status: string }; items: WorkflowItem[]; routedItems?: Array<{ item: WorkflowItem; result: { route?: string; output: Record<string, unknown> } }> }>;
  };
  internals.isCancelled = async () => false;
  internals.renewLease = async () => true;
  const config = type === "condition.if" ? { left: "{{ $json.kind }}", operator: "equals", right: "one" } : { value: "{{ $json.kind }}", cases: [{ value: "one" }, { value: "two" }] };
  const node: WorkflowNode = { id: "condition", type, position: { x: 0, y: 0 }, config };
  const inputs = [{ json: { kind: "one", value: 10 } }, { json: { kind: "two", value: 20 } }, { json: { kind: "other", value: 30 } }];
  const result = await internals.runItemNode("execution", "workspace", node, { trigger: {}, steps: {} }, inputs, "mock", "root", "run", new Set());
  assert.equal(result.result.status, "succeeded");
  assert.deepEqual(result.items.map((item) => item.json), inputs.map((item) => item.json));
  assert.deepEqual(result.items.map((item) => item.pairedItem), inputs.map((_, itemIndex) => ({ nodeId: "condition", itemIndex })));
  assert.deepEqual(result.routedItems?.map(({ result: itemResult }) => itemResult.route), type === "condition.if" ? ["true", "false", "false"] : ["case", "case", "default"]);
  if (type === "condition.switch") assert.deepEqual(result.routedItems?.map(({ result: itemResult }) => itemResult.output.matched), ["one", "two", null]);
  assert.deepEqual(records.map((record) => record.status), ["SUCCEEDED", "SUCCEEDED", "SUCCEEDED"]);
});

for (const kind of ["if", "switch"] as const) for (const mixed of [true, false]) test(`a workflow routes ${mixed ? "mixed" : "matching"} items through ${kind}`, async () => {
  const graph = { nodes: [
    { id: "start", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    { id: "source", type: "action.postgres.select", position: { x: 1, y: 0 }, config: {} },
    { id: "condition", type: `condition.${kind}`, position: { x: 2, y: 0 }, config: kind === "if" ? { left: "{{ $json.kind }}", operator: "equals", right: "one" } : { value: "{{ $json.kind }}", cases: [{ value: "one" }] } },
    { id: "yes", type: "action.http-request", position: { x: 3, y: 0 }, config: { url: "https://example.test/{{ $json.kind }}" } },
    { id: "no", type: "action.http-request", position: { x: 3, y: 1 }, config: { url: "https://example.test/{{ $json.kind }}" } },
  ], edges: [
    { id: "start-source", source: "start", target: "source", kind: "success" },
    { id: "source-condition", source: "source", target: "condition", kind: "success" },
    { id: "condition-yes", source: "condition", target: "yes", kind: kind === "if" ? "true" : "case", ...(kind === "switch" ? { caseValue: "one" } : {}) },
    { id: "condition-yes", source: "condition", target: "no", kind: kind === "if" ? "false" : "default" },
  ] };
  const execution: Record<string, unknown> = { id: "mixed", mode: "MOCK", status: ExecutionStatus.QUEUED, startedAt: null, resumeToken: null, triggerData: {}, nodeExecutions: [], workflowVersion: { workflow: { workspaceId: "workspace" }, graph } };
  const nodes = new Map<string, Record<string, unknown>>();
  const items = new Map<string, Array<Record<string, unknown>>>();
  const prisma = {
    execution: {
      findUnique: async () => execution, findUniqueOrThrow: async () => execution,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(execution, data); return { count: 1 }; },
    },
    nodeExecution: {
      upsert: async ({ create }: { create: { nodeId: string } }) => { nodes.set(create.nodeId, { id: create.nodeId, status: "PENDING" }); },
      findUniqueOrThrow: async ({ where }: { where: { executionId_nodeId: { nodeId: string } } }) => nodes.get(where.executionId_nodeId.nodeId),
      update: async ({ where, data }: { where: { id?: string; executionId_nodeId?: { nodeId: string } }; data: Record<string, unknown> }) => { Object.assign(nodes.get(where.id ?? where.executionId_nodeId!.nodeId)!, data); },
      updateMany: async ({ where }: { where: { nodeId: { in: string[] } } }) => { for (const id of where.nodeId.in) if (nodes.get(id)?.status === "PENDING") nodes.get(id)!.status = "SKIPPED"; return { count: 1 }; },
    },
    nodeExecutionItem: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { for (const row of data) { const key = String(row.nodeExecutionId); const bucket = items.get(key) ?? []; bucket.push(row); items.set(key, bucket); } },
      update: async ({ where, data }: { where: { nodeExecutionId_itemIndex: { nodeExecutionId: string; itemIndex: number } }; data: Record<string, unknown> }) => { Object.assign(items.get(where.nodeExecutionId_itemIndex.nodeExecutionId)![where.nodeExecutionId_itemIndex.itemIndex]!, data); },
      updateMany: async () => ({ count: 0 }),
    },
    $queryRaw: async () => [{ status: execution.status, runToken: execution.runToken }],
    $transaction: async (fn: (client: unknown) => Promise<unknown>) => fn(prisma),
  };
  const service = new ExecutionService(prisma as never, {} as never, { publish: () => undefined } as never);
  const internals = service as unknown as { runNode: (executionId: string, workspaceId: string, node: WorkflowNode) => Promise<{ status: "succeeded"; output: Record<string, unknown>; route: "success" }> };
  internals.runNode = async (_executionId, _workspaceId, node) => ({ status: "succeeded", output: node.id === "source" ? { rows: mixed ? [{ kind: "one" }, { kind: "two" }, { kind: "three" }] : [{ kind: "one" }] } : {}, route: "success" });
  await service.run("mixed", "mock");
  assert.equal(execution.status, ExecutionStatus.SUCCEEDED);
  assert.equal(items.get("yes")?.length, 1);
  assert.equal(items.get("no")?.length ?? 0, mixed ? 2 : 0);
  assert.deepEqual(items.get("yes")?.map((row) => (row.input as { item: { kind: string } }).item.kind), ["one"]);
  assert.deepEqual(items.get("no")?.map((row) => (row.input as { item: { kind: string } }).item.kind) ?? [], mixed ? ["two", "three"] : []);
  if (!mixed) assert.equal(nodes.get("no")?.status, "SKIPPED");
});

test("a failing item condition stops and skips remaining items", async () => {
  const records: Array<Record<string, unknown>> = [];
  const transaction = {
    $queryRaw: async () => [{ status: ExecutionStatus.RUNNING, runToken: "run" }],
    nodeExecution: { findUniqueOrThrow: async () => ({ id: "condition" }), update: async () => ({}) },
    nodeExecutionItem: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => { records.push(...data); },
      update: async ({ where, data }: { where: { nodeExecutionId_itemIndex: { itemIndex: number } }; data: Record<string, unknown> }) => { Object.assign(records[where.nodeExecutionId_itemIndex.itemIndex]!, data); },
      updateMany: async () => { for (const record of records) if (!record.status || record.status === "PENDING") record.status = "SKIPPED"; return { count: 1 }; },
    },
  };
  const service = new ExecutionService({ $transaction: async (fn: (client: typeof transaction) => Promise<unknown>) => fn(transaction) } as never, {} as never, { publish: () => undefined } as never);
  const internals = service as unknown as {
    isCancelled: () => Promise<boolean>; renewLease: () => Promise<boolean>;
    runItemNode: (executionId: string, workspaceId: string, node: WorkflowNode, context: Record<string, unknown>, inputs: WorkflowItem[], mode: "mock", root: string, token: string, restored: ReadonlySet<string>) => Promise<{ result: { status: string }; items: WorkflowItem[] }>;
  };
  internals.isCancelled = async () => false;
  internals.renewLease = async () => true;
  const node: WorkflowNode = { id: "condition", type: "condition.if", position: { x: 0, y: 0 }, config: { operator: "{{ $json.operator }}", left: "x", right: "x" } };
  const inputs = [{ json: { operator: "equals" } }, { json: { operator: "invalid" } }, { json: { operator: "equals" } }];
  const result = await internals.runItemNode("execution", "workspace", node, { trigger: {}, steps: {} }, inputs, "mock", "root", "run", new Set());
  assert.equal(result.result.status, "failed");
  assert.deepEqual(result.items, []);
  assert.deepEqual(records.map((record) => record.status), ["SUCCEEDED", "FAILED", "SKIPPED"]);
});
