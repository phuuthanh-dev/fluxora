import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { ExecutionService } from "./execution.service";

function disposable() {
  try { const url = new URL(process.env.DATABASE_URL ?? ""); return ["localhost", "127.0.0.1"].includes(url.hostname) && /^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(url.pathname); } catch { return false; }
}

test("each persisted trigger runs only its branch, including after queue recovery", { skip: !disposable() }, async () => {
  const prisma = new PrismaClient(), suffix = randomUUID();
  const userId = `multi-user-${suffix}`, workspaceId = `multi-space-${suffix}`, workflowId = `multi-flow-${suffix}`, versionId = `multi-version-${suffix}`;
  const graph = { nodes: [
    { id: "daily", type: "trigger.cron", position: { x: 0, y: 0 }, config: { expression: "16 17 * * *", timezone: "Asia/Ho_Chi_Minh" } },
    { id: "news", type: "trigger.steam.game-news", position: { x: 0, y: 0 }, config: { appId: "4115450", pollMinutes: 5 } },
    { id: "hook", type: "trigger.webhook", position: { x: 0, y: 0 }, config: {} },
    { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    { id: "daily-action", type: "action.edit-fields", position: { x: 0, y: 0 }, config: { fields: [{ name: "kind", type: "text", value: "daily" }] } },
    { id: "news-action", type: "action.edit-fields", position: { x: 0, y: 0 }, config: { fields: [{ name: "kind", type: "text", value: "news" }] } },
    { id: "hook-action", type: "action.edit-fields", position: { x: 0, y: 0 }, config: { fields: [{ name: "kind", type: "text", value: "hook" }] } },
    { id: "manual-action", type: "action.edit-fields", position: { x: 0, y: 0 }, config: { fields: [{ name: "kind", type: "text", value: "manual" }] } },
  ], edges: [
    { id: "one", source: "daily", target: "daily-action", kind: "success" },
    { id: "two", source: "news", target: "news-action", kind: "success" },
    { id: "three", source: "hook", target: "hook-action", kind: "success" },
    { id: "four", source: "manual", target: "manual-action", kind: "success" },
  ] };
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Synthetic", slug: `multi-${suffix}` } });
    await prisma.workspaceMember.create({ data: { workspaceId, userId, role: "OWNER" } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic" } });
    await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version: 1, status: "PUBLISHED", graph } });
    await prisma.workflow.update({ where: { id: workflowId }, data: { publishedVersionId: versionId } });
    const service = new ExecutionService(prisma as never, {} as never, { publish: () => undefined } as never);
    await assert.rejects(service.createManualExecution(workflowId, userId, true, {}, undefined, "daily-action"));
    for (const [trigger, expected] of [["daily", "daily-action"], ["news", "news-action"], ["hook", "hook-action"], ["manual", "manual-action"]] as const) {
      const run = await prisma.execution.create({ data: { workflowVersionId: versionId, mode: "MOCK", triggerNodeId: trigger, triggerData: {} } });
      // Deliberately omit queue startNodeIds as a recovered/retried job can do.
      await service.run(run.id, "mock");
      const steps = await prisma.nodeExecution.findMany({ where: { executionId: run.id } });
      assert.equal(steps.find((item) => item.nodeId === expected)?.status, "SUCCEEDED");
      for (const other of ["daily-action", "news-action", "hook-action", "manual-action"].filter((id) => id !== expected)) {
        assert.equal(steps.find((item) => item.nodeId === other)?.status, "SKIPPED");
      }
    }
    const selected = await service.createManualExecution(workflowId, userId, true, {}, undefined, "news");
    assert.equal(selected.triggerNodeId, "news");
    await service.run(selected.id, "mock");
    const selectedSteps = await prisma.nodeExecution.findMany({ where: { executionId: selected.id } });
    assert.equal(selectedSteps.find((item) => item.nodeId === "news-action")?.status, "SUCCEEDED");
    assert.equal(selectedSteps.find((item) => item.nodeId === "daily-action")?.status, "SKIPPED");
  } finally {
    await prisma.execution.deleteMany({ where: { workflowVersionId: versionId } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.auditLog.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});
