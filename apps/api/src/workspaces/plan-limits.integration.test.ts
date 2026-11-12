import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { ExecutionService } from "../execution/execution.service";
import { PlanCapacityWait } from "../execution/plan-capacity";
import { WorkflowService } from "../workflows/workflow.service";
import { WorkspaceService } from "./workspace.service";

test("workspace plan quota is atomic and concurrent slots wait without starting a second run", { skip: process.env.FLUXORA_PLAN_INTEGRATION !== "1" }, async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(url.pathname)) throw new Error("Plan limit test requires an isolated local test database.");
  const db = new PrismaClient();
  const id = randomUUID(), userId = `plan-user-${id}`, spaceId = `plan-space-${id}`, flowId = `plan-flow-${id}`, versionId = `plan-version-${id}`;
  const old = process.env.PLAN_LIMITS_ENABLED;
  process.env.PLAN_LIMITS_ENABLED = "true";
  try {
    await db.user.create({ data: { id: userId, email: `${id}@example.test` } });
    await db.workspace.create({ data: { id: spaceId, name: "Test", slug: `plan-${id}`, ownerId: userId, members: { create: { userId, role: "OWNER" } } } });
    await db.workflow.create({ data: { id: flowId, workspaceId: spaceId, name: "Test" } });
    await db.workflowVersion.create({ data: { id: versionId, workflowId: flowId, version: 1, graph: { nodes: [{ id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} }], edges: [] } } });
    const service = new ExecutionService(db as never, {} as never, { publish() {} } as never);
    const running = await db.execution.create({ data: { workflowVersionId: versionId, mode: "LIVE", status: "RUNNING", startedAt: new Date() } });
    const waiting = await db.execution.create({ data: { workflowVersionId: versionId, mode: "LIVE" } });
    await assert.rejects(service.run(waiting.id, "live"), PlanCapacityWait);
    assert.equal((await db.execution.findUniqueOrThrow({ where: { id: waiting.id } })).startedAt, null);
    await db.execution.update({ where: { id: running.id }, data: { status: "SUCCEEDED" } });
    // One recorded run plus 998 records leaves one slot. Two workers compete.
    await db.usageRun.createMany({ data: Array.from({ length: 998 }, (_, i) => ({ executionId: `usage-${id}-${i}`, workspaceId: spaceId, startedAt: new Date() })) });
    const second = await db.execution.create({ data: { workflowVersionId: versionId, mode: "LIVE" } });
    const results = await Promise.all([service.run(waiting.id, "live"), service.run(second.id, "live")]);
    assert.equal(results.filter((result) => result?.errorCode === "PLAN_RUN_LIMIT").length, 1);
    assert.equal(await db.usageRun.count({ where: { workspaceId: spaceId } }), 1000);
    await db.workflowVersion.update({ where: { id: versionId }, data: { status: "PUBLISHED" } });
    await db.workflow.update({ where: { id: flowId }, data: { publishedVersionId: versionId } });
    await db.workflow.createMany({ data: Array.from({ length: 5 }, (_, i) => ({ id: `active-${id}-${i}`, workspaceId: spaceId, name: "Active", isActive: true })) });
    const workflows = new WorkflowService(db as never, new WorkspaceService(db as never));
    await assert.rejects(workflows.activate(flowId, userId), (error: unknown) => Boolean(error && typeof error === "object" && "response" in error && (error.response as { code?: string }).code === "PLAN_WORKFLOW_LIMIT"));
  } finally {
    if (old === undefined) delete process.env.PLAN_LIMITS_ENABLED; else process.env.PLAN_LIMITS_ENABLED = old;
    await db.execution.deleteMany({ where: { workflowVersionId: versionId } });
    await db.workflow.deleteMany({ where: { workspaceId: spaceId } });
    await db.workspace.deleteMany({ where: { id: spaceId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  }
});
