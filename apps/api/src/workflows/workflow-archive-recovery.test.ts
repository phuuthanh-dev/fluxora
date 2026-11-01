import assert from "node:assert/strict";
import test from "node:test";
import { WorkflowService } from "./workflow.service";

const archivedWorkflow = {
  id: "workflow-1", workspaceId: "workspace-1", name: "Archived workflow", description: null,
  archivedAt: new Date("2026-10-31T00:00:00Z"), isActive: true, activatedAt: new Date("2026-10-30T00:00:00Z"),
  draftVersion: null, publishedVersion: null, createdAt: new Date("2026-10-29T00:00:00Z"), updatedAt: new Date("2026-10-31T00:00:00Z"),
};

test("archived workflow listing is workspace-owner scoped", async () => {
  let authorized = false;
  let where: unknown;
  const db = { workflow: { findMany: async (query: { where: unknown }) => { assert.equal(authorized, true); where = query.where; return [archivedWorkflow]; } } };
  const service = new WorkflowService(db as never, { requireOwner: async (workspace: string, user: string) => { assert.deepEqual([workspace, user], ["workspace-1", "owner-1"]); authorized = true; } } as never);
  const result = await service.listArchived("workspace-1", "owner-1");
  assert.deepEqual(where, { workspaceId: "workspace-1", archivedAt: { not: null } });
  assert.equal(result[0]?.id, "workflow-1");
  let readAttempted = false;
  const denied = new WorkflowService({ workflow: { findMany: async () => { readAttempted = true; return []; } } } as never, { requireOwner: async () => { throw new Error("not an owner"); } } as never);
  await assert.rejects(denied.listArchived("other-workspace", "owner-1"));
  assert.equal(readAttempted, false);
});

test("restore is owner-scoped, atomic and never resumes live execution", async () => {
  let update: unknown;
  let audit: unknown;
  const restored = { ...archivedWorkflow, archivedAt: null, isActive: false, activatedAt: null };
  const tx = {
    workflow: {
      updateMany: async (query: unknown) => { update = query; return { count: 1 }; },
      findUniqueOrThrow: async () => restored,
    },
    auditLog: { create: async (query: unknown) => { audit = query; } },
  };
  let ownerQuery: unknown;
  const db = {
    workflow: { findFirst: async (query: { where: unknown }) => { ownerQuery = query.where; return archivedWorkflow; } },
    $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx),
  };
  const service = new WorkflowService(db as never, {} as never);
  const result = await service.restore("workflow-1", "owner-1");
  assert.deepEqual(ownerQuery, { id: "workflow-1", workspace: { members: { some: { userId: "owner-1", role: "OWNER" } } } });
  assert.deepEqual(update, { where: { id: "workflow-1", archivedAt: { not: null } }, data: { archivedAt: null, isActive: false, activatedAt: null } });
  assert.deepEqual(audit, { data: { workspaceId: "workspace-1", actorId: "owner-1", action: "workflow.restored", targetType: "workflow", targetId: "workflow-1" } });
  assert.equal(result.isActive, false);
  assert.equal(result.archivedAt, null);
});

test("restore rejects missing ownership and concurrent restore without writing an audit event", async () => {
  let auditWrites = 0;
  const db = {
    workflow: { findFirst: async () => null },
    $transaction: async () => { throw new Error("unexpected transaction"); },
  };
  const denied = new WorkflowService(db as never, {} as never);
  await assert.rejects(denied.restore("workflow-1", "other-user"));
  const tx = { workflow: { updateMany: async () => ({ count: 0 }) }, auditLog: { create: async () => { auditWrites++; } } };
  const raced = new WorkflowService({ workflow: { findFirst: async () => archivedWorkflow }, $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) } as never, {} as never);
  await assert.rejects(raced.restore("workflow-1", "owner-1"));
  assert.equal(auditWrites, 0);
});
