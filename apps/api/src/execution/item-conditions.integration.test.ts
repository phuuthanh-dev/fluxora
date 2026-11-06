import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient, type Prisma } from "@prisma/client";
import type { WorkflowNode } from "@workflow/contracts";
import { ExecutionService } from "./execution.service";
import type { NodeResult, RunMode } from "./node-executor-contract";

function isDisposableDatabase(): boolean {
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    return ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(url.pathname);
  } catch { return false; }
}

for (const kind of ["if", "switch"] as const) test(`item ${kind} persists matching paths using an isolated database`, { skip: !isDisposableDatabase() }, async () => {
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const userId = `item-user-${suffix}`;
  const workspaceId = `item-workspace-${suffix}`;
  const workflowId = `item-workflow-${suffix}`;
  const versionId = `item-version-${suffix}`;
  const executionId = `item-execution-${suffix}`;
  const conditionConfig = kind === "if" ? { left: "{{ $json.kind }}", operator: "equals", right: "one" } : { value: "{{ $json.kind }}", cases: [{ value: "one" }, { value: "two" }] };
  const nodes = [
    { id: "start", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    { id: "source", type: "action.postgres.select", position: { x: 1, y: 0 }, config: { schema: "public", table: "items" } },
    { id: "condition", type: `condition.${kind}`, position: { x: 2, y: 0 }, config: conditionConfig },
    { id: "yes", type: "action.http-request", position: { x: 3, y: 0 }, config: { url: "https://example.test/{{ $json.kind }}" } },
    { id: "no", type: "action.http-request", position: { x: 3, y: 1 }, config: { url: "https://example.test/{{ $json.kind }}" } },
    ...(kind === "switch" ? [{ id: "default", type: "action.http-request", position: { x: 3, y: 2 }, config: { url: "https://example.test/{{ $json.kind }}" } }] : []),
  ];
  const edges = [
    { id: "start-source", source: "start", target: "source", kind: "success" },
    { id: "source-condition", source: "source", target: "condition", kind: "success" },
    { id: "yes-edge", source: "condition", target: "yes", kind: kind === "if" ? "true" : "case", ...(kind === "switch" ? { caseValue: "one" } : {}) },
    { id: "no-edge", source: "condition", target: "no", kind: kind === "if" ? "false" : "case", ...(kind === "switch" ? { caseValue: "two" } : {}) },
    ...(kind === "switch" ? [{ id: "default-edge", source: "condition", target: "default", kind: "default" }] : []),
  ];
  const service = new ExecutionService(prisma as never, {} as never, { publish: () => undefined } as never);
  const internals = service as unknown as { runNode: (execution: string, workspace: string, node: WorkflowNode, context: Record<string, unknown>, mode: RunMode, root: string, token: string, restored: ReadonlySet<string>) => Promise<NodeResult> };
  const originalRunNode = internals.runNode.bind(service);
  internals.runNode = async (...args) => {
    const result = await originalRunNode(...args);
    if (args[2].id !== "source" || result.status !== "succeeded") return result;
    const output = { rows: [{ kind: "one" }, { kind: "two" }, { kind: "other" }], count: 3 };
    await prisma.nodeExecution.update({ where: { executionId_nodeId: { executionId, nodeId: "source" } }, data: { output } });
    return { ...result, output };
  };
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Synthetic", slug: `item-${suffix}` } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic" } });
    await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version: 1, status: "DRAFT", graph: { nodes, edges } as Prisma.InputJsonValue } });
    await prisma.execution.create({ data: { id: executionId, workflowVersionId: versionId, mode: "MOCK" } });
    await service.run(executionId, "mock");
    assert.equal((await prisma.execution.findUniqueOrThrow({ where: { id: executionId } })).status, "SUCCEEDED");
    const nodeRows = await prisma.nodeExecution.findMany({ where: { executionId }, include: { items: { orderBy: { itemIndex: "asc" } } } });
    const byNode = new Map(nodeRows.map((row) => [row.nodeId, row]));
    assert.equal(byNode.get("condition")?.items.length, 3);
    assert.deepEqual(byNode.get("yes")?.items.map((row) => row.parentItemIndex), [0]);
    assert.deepEqual(byNode.get("no")?.items.map((row) => row.parentItemIndex), kind === "if" ? [1, 2] : [1]);
    if (kind === "switch") assert.deepEqual(byNode.get("default")?.items.map((row) => row.parentItemIndex), [2]);
    for (const name of kind === "if" ? ["yes", "no"] : ["yes", "no", "default"]) {
      assert.equal(byNode.get(name)?.status, "SUCCEEDED");
      assert.ok(byNode.get(name)?.items.every((row) => row.parentNodeId === "condition" && row.status === "SUCCEEDED"));
    }
  } finally {
    await prisma.execution.deleteMany({ where: { workflowVersionId: versionId } });
    await prisma.workflowVersion.deleteMany({ where: { id: versionId } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});

for (const scenario of ["source-error", "invalid-output", "too-many", "success", "unhandled", "cancelled"] as const) test(`list source ${scenario} uses its configured error path`, { skip: !isDisposableDatabase() }, async () => {
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const userId = `item-error-user-${suffix}`;
  const workspaceId = `item-error-workspace-${suffix}`;
  const workflowId = `item-error-workflow-${suffix}`;
  const versionId = `item-error-version-${suffix}`;
  const executionId = `item-error-execution-${suffix}`;
  const nodes = [
    { id: "start", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    { id: "source", type: "action.postgres.select", position: { x: 1, y: 0 }, config: { schema: "public", table: scenario === "source-error" || scenario === "unhandled" ? "bad-table!" : "items" } },
    { id: "success", type: "action.http-request", position: { x: 2, y: 0 }, config: { url: "https://example.test/success" } },
    { id: "recover", type: "action.http-request", position: { x: 2, y: 1 }, config: { url: "https://example.test/recover" } },
  ];
  const edges = [
    { id: "start-source", source: "start", target: "source", kind: "success" },
    { id: "source-success", source: "source", target: "success", kind: "success" },
    ...(scenario === "unhandled" ? [] : [{ id: "source-error", source: "source", target: "recover", kind: "error" }]),
  ];
  const service = new ExecutionService(prisma as never, {} as never, { publish: () => undefined } as never);
  const internals = service as unknown as { runNode: (execution: string, workspace: string, node: WorkflowNode, context: Record<string, unknown>, mode: RunMode, root: string, token: string, restored: ReadonlySet<string>) => Promise<NodeResult> };
  const originalRunNode = internals.runNode.bind(service);
  internals.runNode = async (...args) => {
    const result = await originalRunNode(...args);
    if (args[2].id !== "source" || result.status !== "succeeded" || (scenario !== "invalid-output" && scenario !== "too-many" && scenario !== "cancelled")) return result;
    const output = { rows: scenario === "too-many" ? Array.from({ length: 101 }, (_, id) => ({ id })) : "not an array" };
    await prisma.nodeExecution.update({ where: { executionId_nodeId: { executionId, nodeId: "source" } }, data: { output } });
    if (scenario === "cancelled") await prisma.execution.update({ where: { id: executionId }, data: { status: "CANCELLED", runToken: null } });
    return { ...result, output };
  };
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Synthetic", slug: `item-error-${suffix}` } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic" } });
    await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version: 1, status: "DRAFT", graph: { nodes, edges } as Prisma.InputJsonValue } });
    await prisma.execution.create({ data: { id: executionId, workflowVersionId: versionId, mode: "MOCK" } });
    await service.run(executionId, "mock");
    const execution = await prisma.execution.findUniqueOrThrow({ where: { id: executionId } });
    const results = await prisma.nodeExecution.findMany({ where: { executionId }, include: { items: true } });
    const byNode = new Map(results.map((row) => [row.nodeId, row]));
    const sourceSucceeded = scenario === "success";
    if (scenario === "cancelled") {
      assert.equal(execution.status, "CANCELLED");
      assert.equal(byNode.get("recover")?.status, "PENDING");
      assert.equal(byNode.get("success")?.status, "PENDING");
      return;
    }
    assert.equal(execution.status, scenario === "unhandled" ? "FAILED" : "SUCCEEDED");
    assert.equal(byNode.get("source")?.status, sourceSucceeded ? "SUCCEEDED" : "FAILED");
    assert.equal(byNode.get("success")?.status, sourceSucceeded ? "SUCCEEDED" : "SKIPPED");
    assert.equal(byNode.get("recover")?.status, sourceSucceeded || scenario === "unhandled" ? "SKIPPED" : "SUCCEEDED");
    if (sourceSucceeded) assert.equal(byNode.get("success")?.items.length, 1);
    if (scenario === "invalid-output") { assert.equal(byNode.get("source")?.errorCode, "INVALID_PROVIDER_RESPONSE"); assert.equal(byNode.get("source")?.output, null); }
    if (scenario === "too-many") { assert.equal(byNode.get("source")?.errorCode, "ITEM_LIMIT_EXCEEDED"); assert.equal(byNode.get("source")?.output, null); }
  } finally {
    await prisma.execution.deleteMany({ where: { workflowVersionId: versionId } });
    await prisma.workflowVersion.deleteMany({ where: { id: versionId } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});
