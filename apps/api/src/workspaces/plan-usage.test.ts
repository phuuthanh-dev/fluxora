import assert from "node:assert/strict";
import test from "node:test";
import { WorkspaceService } from "./workspace.service";
import { effectivePlan, planCatalog } from "@workflow/contracts";

test("trial plans expire at the stated instant and use the agreed catalog", () => {
  const expiry = new Date("2026-11-20T00:00:00Z");
  assert.equal(effectivePlan("PRO", expiry, new Date("2026-11-19T23:59:59Z")), "PRO");
  assert.equal(effectivePlan("PRO", expiry, expiry), "FREE");
  assert.equal(effectivePlan("UNKNOWN", expiry), "FREE");
  assert.equal(planCatalog.STARTER.priceVnd, 99000);
  assert.equal(planCatalog.PRO.monthlyRuns, 10000);
});

test("usage is owner-scoped, counts started live runs during UTC month and excludes mock", async () => {
  let executionQuery: Record<string, unknown> | undefined;
  let activeQuery: Record<string, unknown> | undefined;
  const prisma = {
    workspaceMember: { findUnique: async ({ where }: { where: { workspaceId_userId: { userId: string } } }) => where.workspaceId_userId.userId === "owner" ? { role: "OWNER", workspaceId: "workspace" } : null },
    workspace: { findUniqueOrThrow: async () => ({ trialPlan: "PRO", trialExpiresAt: new Date("2027-01-01T00:00:00Z") }) },
    execution: { count: async (query: Record<string, unknown>) => { executionQuery = query; return 4; } },
    workflow: { count: async (query: Record<string, unknown>) => { activeQuery = query; return 2; } },
    usageRun: { count: async () => 3 },
    usageMeter: { findUniqueOrThrow: async () => ({ startedAt: new Date("2026-11-10T00:00:00Z") }) },
  };
  const service = new WorkspaceService(prisma as never);
  const result = await service.planUsage("workspace", "owner", new Date("2026-11-30T23:59:59Z"));
  assert.equal(result.plan, "PRO"); assert.equal(result.retainedRuns, 4); assert.equal(result.activeWorkflows, 2);
  assert.equal(result.trackedRuns, 3);
  assert.deepEqual(executionQuery, { where: { mode: "LIVE", startedAt: { gte: new Date("2026-11-01T00:00:00Z"), lt: new Date("2026-12-01T00:00:00Z") }, workflowVersion: { workflow: { workspaceId: "workspace" } } } });
  assert.deepEqual(activeQuery, { where: { workspaceId: "workspace", isActive: true, archivedAt: null } });
  await assert.rejects(service.planUsage("workspace", "another-user"));
});
