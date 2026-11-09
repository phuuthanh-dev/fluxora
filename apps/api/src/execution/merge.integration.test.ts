import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient, type Prisma } from "@prisma/client";
import { mergeInputIssues, type WorkflowGraph, type WorkflowNode } from "@workflow/contracts";
import { ExecutionService } from "./execution.service";
import { parseWorkflowGraph, validatePublishableGraph } from "../workflows/workflow-graph";
import { appendInputs } from "./merge-streams";
import type { NodeResult, RunMode } from "./node-executor-contract";

function disposable(): boolean {
  try { const url = new URL(process.env.DATABASE_URL ?? ""); return ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(url.pathname); } catch { return false; }
}
const node = (id: string, type: WorkflowNode["type"], config: Record<string, unknown> = {}): WorkflowNode => ({ id, type, config, position: { x: 0, y: 0 } });
function graphFor(scenario: string): WorkflowGraph {
  const pause = scenario.startsWith("resume");
  const condition = scenario === "skipped";
  const nodes = [node("start", "trigger.manual"), node("first", "action.postgres.select", { schema: "public", table: scenario === "unhandled" ? "bad!" : "items" }), node("second", "action.edit-fields", { fields: [{ name: "value", type: "text", value: "second" }] }), node("merge", "action.merge"), node("after", "action.edit-fields", { fields: [{ name: "copied", type: "text", value: "{{ $json.value }}" }] })];
  if (scenario.endsWith("matching")) {
    nodes.find((n) => n.id === "merge")!.config = { mode: "matching", field1: "value", field2: "value", outputType: "matches" };
    nodes.find((n) => n.id === "second")!.config = { fields: [{ name: "value", type: "text", value: "first" }] };
  }
  if (pause) nodes.push(node("pause", "approval.request", { notificationProvider: "google_chat" }));
  if (condition) nodes.push(node("if", "condition.if", { left: "yes", right: "yes" }));
  // Intentionally put Merge first in graph order: topology, not array order, must wait.
  nodes.unshift(nodes.splice(3, 1)[0]!);
  const edges: WorkflowGraph["edges"] = [
    { id: "a", source: condition ? "if" : "start", target: "first", kind: condition ? "true" : "success" },
    { id: "b", source: pause ? "pause" : condition ? "if" : "start", target: "second", kind: condition ? "false" : "success" },
    { id: "c", source: "first", target: "merge", kind: "success", targetHandle: "input1" },
    { id: "d", source: "second", target: "merge", kind: "success", targetHandle: "input2" },
    { id: "e", source: "merge", target: "after", kind: "success" },
  ];
  if (pause) edges.push({ id: "pause", source: "start", target: "pause", kind: "success" });
  if (condition) edges.push({ id: "if", source: "start", target: "if", kind: "success" });
  if (scenario === "all-empty") nodes[nodes.findIndex((n) => n.id === "second")] = node("second", "action.postgres.select", { schema: "public", table: "items" });
  if (scenario === "item-branches" || scenario === "handled-error") {
    const branch = scenario === "item-branches" ? node("branch", "condition.if", { left: "{{ $json.value }}", right: "other" }) : node("branch", "action.edit-fields", { fields: [{ name: "value", type: "text", value: "{{ $json.value }}" }] });
    nodes.push(branch);
    edges.splice(edges.findIndex((edge) => edge.id === "b"), 1);
    edges.find((edge) => edge.id === "c")!.source = "branch";
    edges.find((edge) => edge.id === "c")!.kind = scenario === "item-branches" ? "true" : "success";
    edges.find((edge) => edge.id === "d")!.source = "branch";
    edges.find((edge) => edge.id === "d")!.kind = scenario === "item-branches" ? "false" : "error";
    edges.push({ id: "branch", source: "first", target: "branch", kind: "success" });
    if (scenario === "handled-error") nodes.find((n) => n.id === "after")!.config = { fields: [{ name: "copied", type: "text", value: "{{ default($json.error.code, 'ok') }}" }] };
  }
  return { nodes, edges };
}

test("Merge requires distinct numbered ports and bounded Append data", () => {
  const graph = graphFor("ordered");
  assert.deepEqual(parseWorkflowGraph(graph), graph);
  assert.doesNotThrow(() => validatePublishableGraph(graph));
  const incomplete = { ...graph, edges: graph.edges.filter((edge) => edge.id !== "d") };
  assert.doesNotThrow(() => parseWorkflowGraph(incomplete));
  assert.throws(() => validatePublishableGraph(incomplete), /input2|Input 2/);
  assert.ok(mergeInputIssues({ ...graph, edges: [...graph.edges, { ...graph.edges[2]!, id: "duplicate" }] }, false).length);
  assert.throws(() => parseWorkflowGraph({ ...graph, edges: graph.edges.map((edge) => edge.id === "c" ? { ...edge, targetHandle: "input3" } : edge) }));
  assert.throws(() => validatePublishableGraph({ ...graph, nodes: graph.nodes.map((n) => n.id === "merge" ? { ...n, config: { executeOnce: true } } : n) }));
  const streams = new Map([[graph.edges[2]!, Array.from({ length: 100 }, () => ({ json: {} }))], [graph.edges[3]!, [{ json: {} }]]]);
  assert.throws(() => appendInputs(graph, "merge", streams), { code: "ITEM_LIMIT_EXCEEDED" });
  streams.set(graph.edges[2]!, [{ json: { text: "a".repeat(1_000_001) } }]);
  assert.throws(() => appendInputs(graph, "merge", streams), { code: "ITEM_SIZE_EXCEEDED" });
});

for (const scenario of ["ordered", "empty", "all-empty", "skipped", "item-branches", "handled-error", "unhandled", "cancelled", "resume", "resume-redacted", "matching", "resume-matching"] as const) test(`Merge ${scenario}: real runner persists ordered items without repeating providers`, { skip: !disposable() }, async () => {
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const userId = `merge-user-${suffix}`, workspaceId = `merge-workspace-${suffix}`, workflowId = `merge-workflow-${suffix}`, versionId = `merge-version-${suffix}`, executionId = `merge-execution-${suffix}`;
  const graph = graphFor(scenario);
  const service = new ExecutionService(prisma as never, {} as never, { publish: () => undefined } as never);
  const internals = service as unknown as { runNode: (execution: string, workspace: string, node: WorkflowNode, context: Record<string, unknown>, mode: RunMode, root: string, token: string, restored: ReadonlySet<string>) => Promise<NodeResult> };
  const original = internals.runNode.bind(service);
  let reads = 0;
  internals.runNode = async (...args) => {
    const result = await original(...args);
    if (args[2].type !== "action.postgres.select" || result.status !== "succeeded") return result;
    reads++;
    const rows = scenario === "item-branches" ? [{ value: "first" }, { value: "other" }, { value: "last" }] : scenario === "handled-error" ? [{ value: "first" }, { value: { nested: "invalid text" } }, { value: "last" }] : scenario === "empty" || scenario === "all-empty" ? [] : [{ value: scenario === "resume-redacted" ? "[REDACTED]" : "first" }, { value: "first-again" }];
    const output = { rows, count: rows.length };
    await prisma.nodeExecution.update({ where: { executionId_nodeId: { executionId, nodeId: args[2].id } }, data: { output } });
    if (scenario === "cancelled") await prisma.execution.update({ where: { id: executionId }, data: { status: "CANCELLED", runToken: null } });
    return { ...result, output };
  };
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Synthetic Merge", slug: `merge-${suffix}` } });
    await prisma.workspaceMember.create({ data: { userId, workspaceId, role: "OWNER" } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic Merge" } });
    await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version: 1, status: "DRAFT", graph: graph as unknown as Prisma.InputJsonValue } });
    await prisma.execution.create({ data: { id: executionId, workflowVersionId: versionId, mode: "MOCK" } });
    await service.run(executionId, "mock");
    if (scenario.startsWith("resume")) {
      assert.equal((await prisma.execution.findUniqueOrThrow({ where: { id: executionId } })).status, "WAITING_APPROVAL");
      const approval = await prisma.approvalRequest.findFirstOrThrow({ where: { executionId } });
      const resumed = await service.resolveApproval(approval.id, userId, "approved");
      await service.run(executionId, "mock", resumed.startNodeIds, undefined, false, resumed.resumeToken);
      assert.equal(reads, 1, "completed source must not be re-run after approval");
    }
    const execution = await prisma.execution.findUniqueOrThrow({ where: { id: executionId } });
    assert.equal(execution.status, scenario === "cancelled" ? "CANCELLED" : ["unhandled", "resume-redacted"].includes(scenario) ? "FAILED" : "SUCCEEDED");
    const records = await prisma.nodeExecution.findMany({ where: { executionId }, include: { items: { orderBy: { itemIndex: "asc" } } } });
    const merge = records.find((row) => row.nodeId === "merge")!;
    const after = records.find((row) => row.nodeId === "after")!;
    if (["unhandled", "cancelled"].includes(scenario)) assert.equal(after.items.length, 0);
    else if (scenario === "resume-redacted") assert.equal(after.items[0]?.errorCode, "REDACTED_INPUT_UNAVAILABLE");
    else if (scenario === "handled-error") {
      assert.equal(records.find((row) => row.nodeId === "branch")!.status, "FAILED");
      assert.equal(merge.items.length, 3);
      assert.deepEqual(after.items.map((item) => (item.output as { copied: string }).copied), ["ok", "ok", "ITEM_FAILED"]);
    } else {
      const values = scenario.endsWith("matching") ? ["first"] : scenario === "item-branches" ? ["other", "first", "last"] : scenario === "all-empty" ? [] : scenario === "empty" ? ["second"] : scenario === "skipped" ? ["first", "first-again"] : ["first", "first-again", "second"];
      assert.deepEqual((merge.output as { items: Array<{ value: string }> }).items.map((item) => item.value), values);
      assert.deepEqual(after.items.map((item) => (item.output as { copied: string }).copied), values);
      assert.ok(after.items.every((item, index) => item.parentNodeId === "merge" && item.parentItemIndex === index));
      assert.equal(scenario === "all-empty" ? after.status : merge.status, scenario === "all-empty" ? "SKIPPED" : "SUCCEEDED");
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
