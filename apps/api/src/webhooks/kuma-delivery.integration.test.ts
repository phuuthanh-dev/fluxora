import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { ConflictException } from "@nestjs/common";
import { ExecutionService } from "../execution/execution.service";

// A disposable local DB is mandatory; this test creates and deletes fixtures.
test("Kuma deduplication is atomic, detects conflicts and respects lifecycle", { skip: process.env.FLUXORA_KUMA_INTEGRATION !== "1" }, async () => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(database.pathname) || !["localhost", "127.0.0.1"].includes(database.hostname)) throw new Error("Kuma integration requires a disposable local fluxora_*test* database.");
  const previousKey = process.env.APP_ENCRYPTION_KEY;
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const userId = `kuma-user-${suffix}`, workspaceId = `kuma-workspace-${suffix}`, workflowId = `kuma-flow-${suffix}`, versionId = `kuma-version-${suffix}`, endpointId = `kuma-endpoint-${suffix}`;
  const path = `kuma-${suffix}`;
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Synthetic", slug: `kuma-${suffix}` } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic", isActive: true } });
    const graph = { nodes: [{ id: "kuma", type: "trigger.uptime-kuma.alert.v2", position: { x: 0, y: 0 }, config: {} }], edges: [] };
    await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version: 1, status: "PUBLISHED", graph } });
    await prisma.workflow.update({ where: { id: workflowId }, data: { publishedVersionId: versionId } });
    await prisma.webhookEndpoint.create({ data: { id: endpointId, path, workflowId, workflowVersionId: versionId, secretHash: "synthetic-hash" } });
    const service = new ExecutionService(prisma as never, {} as never, {} as never);
    const input = { workflowId, workflowVersionId: versionId, endpointId, path, secretHash: "synthetic-hash", payload: { source: "uptime-kuma", monitor: { id: "1", name: "API" }, heartbeat: { status: 0, time: null, ping: null }, message: "Down" }, deliveryKey: "synthetic-delivery" };
    const [first, second] = await Promise.all([service.createKumaScheduledExecution(input), service.createKumaScheduledExecution(input)]);
    assert.equal(first.id, second.id);
    assert.equal(await prisma.execution.count({ where: { workflowVersionId: versionId } }), 1);
    assert.ok(!first.idempotencyKey?.includes(input.deliveryKey));
    await assert.rejects(service.createKumaScheduledExecution({ ...input, payload: { ...input.payload, message: "Changed" } }), (error: unknown) => error instanceof ConflictException && (error.getResponse() as { code: string }).code === "WEBHOOK_DELIVERY_CONFLICT");
    const anonymous1 = await service.createKumaScheduledExecution({ ...input, deliveryKey: undefined });
    const anonymous2 = await service.createKumaScheduledExecution({ ...input, deliveryKey: undefined });
    assert.notEqual(anonymous1.id, anonymous2.id);
    await prisma.webhookEndpoint.update({ where: { id: endpointId }, data: { secretHash: "rotated" } });
    await assert.rejects(service.createKumaScheduledExecution(input));
    await prisma.workflow.update({ where: { id: workflowId }, data: { isActive: false } });
    await assert.rejects(service.createKumaScheduledExecution({ ...input, secretHash: "rotated" }));
  } finally {
    await prisma.execution.deleteMany({ where: { workflowVersion: { workflowId } } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    if (previousKey === undefined) delete process.env.APP_ENCRYPTION_KEY; else process.env.APP_ENCRYPTION_KEY = previousKey;
  }
});
