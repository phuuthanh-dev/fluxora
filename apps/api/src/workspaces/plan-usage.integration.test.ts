import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { WorkspaceService } from "./workspace.service";
import { AdminController } from "../admin/admin.controller";

test("retained usage is workspace-scoped and admin trial changes are audited", { skip: process.env.FLUXORA_CREDENTIAL_INTEGRATION !== "1" }, async () => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(database.pathname) || !["localhost", "127.0.0.1"].includes(database.hostname)) throw new Error("Plan integration requires an isolated local test database.");
  const db = new PrismaClient(), suffix = randomUUID();
  const user = `plan-user-${suffix}`, other = `plan-other-${suffix}`, space = `plan-space-${suffix}`, flow = `plan-flow-${suffix}`, version = `plan-version-${suffix}`;
  const now = new Date("2026-11-15T12:00:00Z");
  try {
    await db.user.createMany({ data: [{ id: user, email: `${suffix}@example.test` }, { id: other, email: `other-${suffix}@example.test` }] });
    await db.workspace.create({ data: { id: space, name: "Test", slug: `plan-${suffix}`, ownerId: user, members: { create: { userId: user, role: "OWNER" } } } });
    await db.workflow.create({ data: { id: flow, workspaceId: space, name: "Test", isActive: true } });
    await db.workflowVersion.create({ data: { id: version, workflowId: flow, version: 1, graph: { nodes: [], edges: [] } } });
    await db.execution.createMany({ data: [
      { workflowVersionId: version, mode: "LIVE", startedAt: now, status: "SUCCEEDED" },
      { workflowVersionId: version, mode: "MOCK", startedAt: now, status: "SUCCEEDED" },
      { workflowVersionId: version, mode: "LIVE", status: "QUEUED" },
      { workflowVersionId: version, mode: "LIVE", startedAt: new Date("2026-10-31T23:59:59Z"), status: "FAILED" },
    ] });
    const service = new WorkspaceService(db as never);
    const initial = await service.planUsage(space, user, now);
    assert.equal(initial.retainedRuns, 1); assert.equal(initial.activeWorkflows, 1); assert.equal(initial.plan, "FREE");
    await assert.rejects(service.planUsage(space, other, now));
    const admin = new AdminController(db as never, {} as never, {} as never);
    const result = await admin.setTrialPlan(space, { currentUser: { id: user } } as never, { plan: "PRO", days: 14 });
    assert.equal(result.plan, "PRO");
    assert.equal((await db.auditLog.count({ where: { workspaceId: space, action: "admin.trial_plan_changed" } })), 1);
    assert.equal((await db.workflow.findUniqueOrThrow({ where: { id: flow } })).isActive, true);
  } finally {
    await db.auditLog.deleteMany({ where: { workspaceId: space } });
    await db.execution.deleteMany({ where: { workflowVersionId: version } });
    await db.workflow.deleteMany({ where: { id: flow } });
    await db.workspace.deleteMany({ where: { id: space } });
    await db.user.deleteMany({ where: { id: { in: [user, other] } } });
    await db.$disconnect();
  }
});
