import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Prisma, PrismaClient } from "@prisma/client";
import { ExecutionMaintenanceService } from "./execution-maintenance.service";

// Evaluate the actual retention filters on PostgreSQL without letting the
// service delete unrelated test executions when other suites run in parallel.
test("count retention preserves recent webhook delivery identities", { skip: process.env.FLUXORA_RETENTION_INTEGRATION !== "1" }, async () => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(database.pathname) || !["localhost", "127.0.0.1"].includes(database.hostname)) throw new Error("Retention integration requires a disposable local fluxora_*test* database.");
  const previousMax = process.env.EXECUTION_RETENTION_MAX_COUNT;
  process.env.EXECUTION_RETENTION_MAX_COUNT = "1";
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const userId = `retention-user-${suffix}`, workspaceId = `retention-workspace-${suffix}`, workflowId = `retention-flow-${suffix}`, versionId = `retention-version-${suffix}`;
  const now = new Date("2026-11-03T12:00:00.000Z");
  const recent = new Date(now.getTime() - 60 * 60 * 1000);
  const old = new Date(now.getTime() - 25 * 60 * 60 * 1000);
  const ids = ["telegram-recent", "kuma-recent", "webhook-recent", "telegram-old", "kuma-old", "webhook-old", "ordinary"].map((name) => `${name}-${suffix}`);
  const selectedForDeletion: string[][] = [];
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Synthetic", slug: `retention-${suffix}` } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic" } });
    await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version: 1, status: "PUBLISHED", graph: { nodes: [], edges: [] } } });
    await prisma.execution.createMany({ data: [
      { id: ids[0]!, workflowVersionId: versionId, status: "SUCCEEDED", idempotencyKey: `telegram-v1:${suffix}-recent`, completedAt: recent },
      { id: ids[1]!, workflowVersionId: versionId, status: "SUCCEEDED", idempotencyKey: `kuma-v2:${suffix}-recent`, completedAt: recent },
      { id: ids[2]!, workflowVersionId: versionId, status: "SUCCEEDED", idempotencyKey: `webhook:${suffix}:github:recent`, completedAt: recent },
      { id: ids[3]!, workflowVersionId: versionId, status: "SUCCEEDED", idempotencyKey: `telegram-v1:${suffix}-old`, completedAt: old },
      { id: ids[4]!, workflowVersionId: versionId, status: "SUCCEEDED", idempotencyKey: `kuma-v2:${suffix}-old`, completedAt: old },
      { id: ids[5]!, workflowVersionId: versionId, status: "SUCCEEDED", idempotencyKey: `webhook:${suffix}:github:old`, completedAt: old },
      { id: ids[6]!, workflowVersionId: versionId, status: "SUCCEEDED", completedAt: now },
    ] });
    const scoped = (where: Prisma.ExecutionWhereInput): Prisma.ExecutionWhereInput => ({ AND: [where, { id: { in: ids } }] });
    const service = new ExecutionMaintenanceService({ execution: {
      findMany: (query: Prisma.ExecutionFindManyArgs) => prisma.execution.findMany({ ...query, where: scoped(query.where ?? {}), select: { id: true } }),
      deleteMany: async (query: Prisma.ExecutionDeleteManyArgs) => {
        const rows = await prisma.execution.findMany({ where: scoped(query.where ?? {}), select: { id: true } });
        selectedForDeletion.push(rows.map((row) => row.id));
        return { count: 0 };
      },
    } } as never, {} as never);
    await service.pruneFinished(now);
    assert.deepEqual(selectedForDeletion[0], []);
    assert.deepEqual(new Set(selectedForDeletion[1]), new Set([ids[3], ids[4], ids[5]]));
    assert.ok(!selectedForDeletion.flat().includes(ids[0]!));
    assert.ok(!selectedForDeletion.flat().includes(ids[1]!));
    assert.ok(!selectedForDeletion.flat().includes(ids[2]!));
  } finally {
    await prisma.execution.deleteMany({ where: { id: { in: ids } } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    if (previousMax === undefined) delete process.env.EXECUTION_RETENTION_MAX_COUNT; else process.env.EXECUTION_RETENTION_MAX_COUNT = previousMax;
  }
});
