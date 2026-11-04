import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { ConflictException } from "@nestjs/common";
import { ExecutionService } from "../execution/execution.service";
import { ExecutionMaintenanceService } from "../execution/execution-maintenance.service";

test("Vercel duplicate delivery stays deduplicated through early history pruning", { skip: process.env.FLUXORA_VERCEL_INTEGRATION !== "1" }, async () => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(database.pathname) || !["localhost", "127.0.0.1"].includes(database.hostname)) throw new Error("Vercel integration requires a disposable local fluxora_*test* database.");
  const previousKey = process.env.APP_ENCRYPTION_KEY, previousMax = process.env.EXECUTION_RETENTION_MAX_COUNT;
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");
  process.env.EXECUTION_RETENTION_MAX_COUNT = "1";
  const prisma = new PrismaClient(), suffix = randomUUID();
  const userId = `vercel-user-${suffix}`, workspaceId = `vercel-workspace-${suffix}`, workflowId = `vercel-flow-${suffix}`, versionId = `vercel-version-${suffix}`, endpointId = `vercel-endpoint-${suffix}`;
  const path = `vercel-${suffix}`;
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Synthetic", slug: `vercel-${suffix}` } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic", isActive: true } });
    const graph = { nodes: [{ id: "vercel", type: "trigger.vercel.deployment", position: { x: 0, y: 0 }, config: { event: "deployment.ready", team: "personal", project: "prj_example" } }], edges: [] };
    await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version: 1, status: "PUBLISHED", graph } });
    await prisma.workflow.update({ where: { id: workflowId }, data: { publishedVersionId: versionId } });
    await prisma.webhookEndpoint.create({ data: { id: endpointId, path, workflowId, workflowVersionId: versionId, secretHash: "synthetic-hash" } });
    const service = new ExecutionService(prisma as never, {} as never, {} as never);
    const input = { workflowId, workflowVersionId: versionId, endpointId, path, secretHash: "synthetic-hash", payload: { source: "vercel", event: "deployment.ready", eventId: "evt_example", projectId: "prj_example", deploymentId: "dpl_example", teamId: null }, deliveryKey: "evt_example" };
    const [first, second] = await Promise.all([service.createVercelScheduledExecution(input), service.createVercelScheduledExecution(input)]);
    assert.equal(first.id, second.id);
    await assert.rejects(service.createVercelScheduledExecution({ ...input, payload: { ...input.payload, deploymentId: "dpl_changed" } }), (error: unknown) => error instanceof ConflictException && (error.getResponse() as { code: string }).code === "WEBHOOK_DELIVERY_CONFLICT");
    const now = new Date();
    await prisma.execution.update({ where: { id: first.id }, data: { status: "SUCCEEDED", completedAt: now } });
    await prisma.execution.createMany({ data: [0, 1].map(() => ({ workflowVersionId: versionId, mode: "MOCK", status: "SUCCEEDED", completedAt: now })) });
    // Restrict maintenance to this fixture: other integration files may use
    // the same disposable database concurrently.
    const scoped = { execution: {
      deleteMany: (args: { where: Prisma.ExecutionWhereInput }) => prisma.execution.deleteMany({ where: { AND: [args.where, { workflowVersionId: versionId }] } }),
      findMany: (args: Prisma.ExecutionFindManyArgs) => prisma.execution.findMany({ ...args, where: { AND: [args.where ?? {}, { workflowVersionId: versionId }] } }),
    } };
    await new ExecutionMaintenanceService(scoped as never, service).pruneFinished(now);
    assert.ok(await prisma.execution.findUnique({ where: { id: first.id } }));
    assert.equal((await service.createVercelScheduledExecution(input)).id, first.id);
    await prisma.webhookEndpoint.update({ where: { id: endpointId }, data: { secretHash: "rotated" } });
    await assert.rejects(service.createVercelScheduledExecution(input));
  } finally {
    await prisma.execution.deleteMany({ where: { workflowVersion: { workflowId } } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    if (previousKey === undefined) delete process.env.APP_ENCRYPTION_KEY; else process.env.APP_ENCRYPTION_KEY = previousKey;
    if (previousMax === undefined) delete process.env.EXECUTION_RETENTION_MAX_COUNT; else process.env.EXECUTION_RETENTION_MAX_COUNT = previousMax;
  }
});
