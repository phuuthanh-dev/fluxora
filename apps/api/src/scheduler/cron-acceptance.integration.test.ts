import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { ExecutionService } from "../execution/execution.service";

test("cron acceptance serializes with deactivation and version changes", { skip: process.env.FLUXORA_CRON_INTEGRATION !== "1" }, async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(url.pathname)) throw new Error("Cron integration requires a disposable local fluxora_*test* database.");
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const userId = `cron-owner-${suffix}`, workspaceId = `cron-space-${suffix}`, workflowId = `cron-flow-${suffix}`, firstId = `cron-v1-${suffix}`, secondId = `cron-v2-${suffix}`;
  const graph = { nodes: [{ id: "cron", type: "trigger.cron", position: { x: 0, y: 0 }, config: { expression: "* * * * *", timezone: "UTC" } }], edges: [] };
  const data = { scheduledAt: "2026-11-03T00:00:00.000Z", timezone: "UTC" };
  let release: (() => void) | undefined;
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Synthetic", slug: `cron-${suffix}` } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic", isActive: true } });
    await prisma.workflowVersion.createMany({ data: [
      { id: firstId, workflowId, version: 1, status: "PUBLISHED", graph },
      { id: secondId, workflowId, version: 2, status: "PUBLISHED", graph },
    ] });
    await prisma.workflow.update({ where: { id: workflowId }, data: { publishedVersionId: firstId } });
    const service = new ExecutionService(prisma as never, {} as never, {} as never);
    const key = `cron:${suffix}:accepted`;
    const [first, duplicate] = await Promise.all([service.createCronScheduledExecution(firstId, data, key), service.createCronScheduledExecution(firstId, data, key)]);
    assert.equal(first.id, duplicate.id);
    assert.equal(await prisma.execution.count({ where: { idempotencyKey: key } }), 1);

    for (const change of ["deactivate", "republish"] as const) {
      await prisma.workflow.update({ where: { id: workflowId }, data: { isActive: true, publishedVersionId: firstId } });
      let loaded!: () => void;
      const snapshotLoaded = new Promise<void>((resolve) => { loaded = resolve; });
      const resume = new Promise<void>((resolve) => { release = resolve; });
      const wrapped = {
        workflowVersion: { findUnique: async (args: Parameters<typeof prisma.workflowVersion.findUnique>[0]) => { const snapshot = await prisma.workflowVersion.findUnique(args); loaded(); await resume; return snapshot; } },
        $transaction: prisma.$transaction.bind(prisma),
      };
      const delayed = new ExecutionService(wrapped as never, {} as never, {} as never);
      const staleKey = `cron:${suffix}:${change}`;
      const pending = delayed.createCronScheduledExecution(firstId, data, staleKey);
      await snapshotLoaded;
      await prisma.workflow.update({ where: { id: workflowId }, data: change === "deactivate" ? { isActive: false } : { publishedVersionId: secondId } });
      release!(); release = undefined;
      await assert.rejects(pending, (error: any) => error.response?.code === "WORKFLOW_CHANGED");
      assert.equal(await prisma.execution.count({ where: { idempotencyKey: staleKey } }), 0);
    }
    assert.equal((await prisma.execution.findUniqueOrThrow({ where: { id: first.id } })).status, "QUEUED");
  } finally {
    release?.();
    await prisma.execution.deleteMany({ where: { workflowVersionId: { in: [firstId, secondId] } } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});
