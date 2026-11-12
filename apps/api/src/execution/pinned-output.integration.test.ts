import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { ExecutionService } from "./execution.service";
import { parseWorkflowGraph } from "../workflows/workflow-graph";

function disposable() {
  try { const url = new URL(process.env.DATABASE_URL ?? ""); return ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(url.pathname); } catch { return false; }
}

test("pinned output is restricted to bounded action data", () => {
  const graph = { nodes: [{ id: "a", type: "action.http-request", position: { x: 0, y: 0 }, config: {}, pinData: { answer: 42 } }], edges: [] };
  assert.deepEqual(parseWorkflowGraph(graph).nodes[0]?.pinData, { answer: 42 });
  assert.throws(() => parseWorkflowGraph({ ...graph, nodes: [{ ...graph.nodes[0], pinData: { value: "x".repeat(65536) } }] }));
  assert.throws(() => parseWorkflowGraph({ ...graph, nodes: [{ ...graph.nodes[0], type: "trigger.manual" }] }));
});

test("pin bypasses a provider only for mock executions", { skip: !disposable() }, async () => {
  const prisma = new PrismaClient(), suffix = randomUUID();
  const userId = `pin-user-${suffix}`, workspaceId = `pin-space-${suffix}`, workflowId = `pin-flow-${suffix}`, versionId = `pin-version-${suffix}`;
  const graph = { nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    { id: "request", type: "action.http-request", position: { x: 0, y: 0 }, config: { url: "invalid" }, pinData: { answer: 42 } },
  ], edges: [{ id: "edge", source: "manual", target: "request", kind: "success" }] };
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Synthetic", slug: `pin-${suffix}` } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic" } });
    await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version: 1, status: "PUBLISHED", graph } });
    const service = new ExecutionService(prisma as never, {} as never, { publish: () => undefined } as never);
    for (const mode of ["mock", "live"] as const) {
      const run = await prisma.execution.create({ data: { workflowVersionId: versionId, mode: mode === "mock" ? "MOCK" : "LIVE", triggerData: {} } });
      await service.run(run.id, mode);
      const step = await prisma.nodeExecution.findUniqueOrThrow({ where: { executionId_nodeId: { executionId: run.id, nodeId: "request" } } });
      assert.equal(step.status, mode === "mock" ? "SUCCEEDED" : "FAILED");
      if (mode === "mock") assert.deepEqual(step.output, { answer: 42 });
    }
  } finally {
    await prisma.execution.deleteMany({ where: { workflowVersionId: versionId } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});
