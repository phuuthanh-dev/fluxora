import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient, type Prisma } from "@prisma/client";
import type { WorkflowGraph, WorkflowNode } from "@workflow/contracts";
import { ExecutionService } from "./execution.service";
import type { NodeResult, RunMode } from "./node-executor-contract";

function disposable(): boolean {
  try { const url = new URL(process.env.DATABASE_URL ?? ""); return ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(url.pathname); } catch { return false; }
}
const node = (id: string, type: WorkflowNode["type"], config: Record<string, unknown> = {}): WorkflowNode => ({ id, type, config, position: { x: 0, y: 0 } });

for (const scenario of ["ordered", "empty", "resume", "invalid-sort", "duplicates", "historical", "historical-live"] as const) test(`Data transforms ${scenario}: whole-stream execution, empty aggregation and resume`, { skip: !disposable() }, async () => {
  const prisma = new PrismaClient(), suffix = randomUUID();
  const previousKey = process.env.APP_ENCRYPTION_KEY;
  if (scenario === "historical" || scenario === "historical-live") process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  const userId = `data-user-${suffix}`, workspaceId = `data-workspace-${suffix}`, workflowId = `data-workflow-${suffix}`, versionId = `data-version-${suffix}`, executionId = `data-execution-${suffix}`;
  const nodes = [node("start", "trigger.manual"), node("source", "action.postgres.select", { schema: "public", table: "items" }), node("aggregate", "action.aggregate", { outputField: "entries" }), node("split", "action.split-out", { field: "entries", include: "none" }), node("sort", "action.sort", { field: "score", valueType: "number", direction: "asc" }), node("limit", "action.limit", { maxItems: 2, keep: "first" }), node("after", "action.edit-fields", { fields: [{ name: "score", type: "number", value: "{{ $json.score }}" }] })];
  if (scenario === "duplicates") nodes.splice(4, 0, node("unique", "action.remove-duplicates", { compare: "selected", fields: "score" }));
  if (scenario === "historical" || scenario === "historical-live") nodes.splice(4, 0, node("unique", "action.remove-duplicates", { operation: "history", historyFields: "score", historyMode: "new" }));
  const graph: WorkflowGraph = { nodes, edges: nodes.slice(1).map((target, index) => ({ id: `edge-${index}`, source: nodes[index]!.id, target: target.id, kind: "success" })) };
  if (scenario === "resume") { nodes.push(node("pause", "approval.request", { notificationProvider: "google_chat" })); graph.edges.push({ id: "pause", source: "start", target: "pause", kind: "success" }); }
  const service = new ExecutionService(prisma as never, {} as never, { publish: () => undefined } as never);
  const internals = service as unknown as { runNode: (execution: string, workspace: string, node: WorkflowNode, context: Record<string, unknown>, mode: RunMode, root: string, token: string, restored: ReadonlySet<string>) => Promise<NodeResult> };
  const original = internals.runNode.bind(service); let reads = 0;
  internals.runNode = async (...args) => {
    // Keep the provider synthetic while exercising the real live transform path.
    if (scenario === "historical-live" && args[2].id === "source") args[4] = "mock";
    const result = await original(...args);
    if (args[2].id !== "source" || result.status !== "succeeded") return result;
    reads++;
    const rows = scenario === "empty" ? [] : [{ score: 3 }, { score: scenario === "invalid-sort" ? "wrong type" : 1 }, { score: 2 }];
    if (scenario === "duplicates" || scenario === "historical" || scenario === "historical-live") rows.push({ score: 1 });
    const output = { rows, count: rows.length };
    await prisma.nodeExecution.update({ where: { executionId_nodeId: { executionId: args[0], nodeId: "source" } }, data: { output } });
    return { ...result, output };
  };
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Synthetic data transforms", slug: `data-${suffix}` } });
    await prisma.workspaceMember.create({ data: { userId, workspaceId, role: "OWNER" } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic data transforms" } });
    await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version: 1, status: "DRAFT", graph: graph as unknown as Prisma.InputJsonValue } });
    await prisma.execution.create({ data: { id: executionId, workflowVersionId: versionId, mode: scenario === "historical-live" ? "LIVE" : "MOCK" } });
    await service.run(executionId, scenario === "historical-live" ? "live" : "mock");
    if (scenario === "resume") {
      const approval = await prisma.approvalRequest.findFirstOrThrow({ where: { executionId } });
      const resumed = await service.resolveApproval(approval.id, userId, "approved");
      await service.run(executionId, "mock", resumed.startNodeIds, undefined, false, resumed.resumeToken);
    }
    assert.equal(reads, 1);
    const execution = await prisma.execution.findUniqueOrThrow({ where: { id: executionId } });
    const records = await prisma.nodeExecution.findMany({ where: { executionId }, include: { items: { orderBy: { itemIndex: "asc" } } } });
    assert.equal(execution.status, scenario === "invalid-sort" ? "FAILED" : "SUCCEEDED");
    const aggregate = records.find((row) => row.nodeId === "aggregate")!;
    assert.equal(aggregate.items.length, 1, "Aggregate runs once for the complete input stream");
    const entries = (aggregate.output as { items: Array<{ entries: unknown[] }> }).items[0]!.entries;
    assert.equal(entries.length, scenario === "empty" ? 0 : scenario === "duplicates" || scenario === "historical" || scenario === "historical-live" ? 4 : 3);
    if (scenario === "duplicates") assert.deepEqual(records.find((row) => row.nodeId === "unique")!.items.map((item) => (item.output as { score: number }).score), [3, 1, 2]);
    if (scenario === "historical" || scenario === "historical-live") assert.deepEqual(records.find((row) => row.nodeId === "unique")!.items.map((item) => (item.output as { score: number }).score), [3, 1, 2, 1]);
    const after = records.find((row) => row.nodeId === "after")!;
    if (scenario === "invalid-sort") { assert.equal(records.find((row) => row.nodeId === "sort")!.status, "FAILED"); assert.equal(after.items.length, 0); }
    else if (scenario === "empty") { assert.equal(after.status, "SKIPPED"); assert.equal(after.items.length, 0); }
    else assert.deepEqual(after.items.map((item) => (item.output as { score: number }).score), scenario === "historical" || scenario === "historical-live" ? [1, 1] : [1, 2]);
    if (scenario === "historical-live") {
      const secondId = `${executionId}-second`;
      await prisma.execution.create({ data: { id: secondId, workflowVersionId: versionId, mode: "LIVE" } });
      await service.run(secondId, "live");
      const second = await prisma.nodeExecution.findUniqueOrThrow({ where: { executionId_nodeId: { executionId: secondId, nodeId: "unique" } }, include: { items: true } });
      assert.equal(second.status, "SUCCEEDED");
      assert.equal(second.items.length, 0, "a later live execution filters already-seen values");
    }
  } finally {
    await prisma.execution.deleteMany({ where: { workflowVersionId: versionId } });
    await prisma.workflowVersion.deleteMany({ where: { id: versionId } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    if (scenario === "historical" || scenario === "historical-live") { if (previousKey === undefined) delete process.env.APP_ENCRYPTION_KEY; else process.env.APP_ENCRYPTION_KEY = previousKey; }
  }
});
