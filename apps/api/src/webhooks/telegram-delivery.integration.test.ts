import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { ConflictException } from "@nestjs/common";
import { ExecutionService } from "../execution/execution.service";
import { TelegramDeliveryRecoveryService } from "./telegram-delivery-recovery.service";

test("Telegram delivery identity is durable, concurrent-safe and detects conflicts", { skip: process.env.FLUXORA_TELEGRAM_INTEGRATION !== "1" }, async () => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(database.pathname) || !["localhost", "127.0.0.1"].includes(database.hostname)) throw new Error("Telegram integration requires a disposable local fluxora_*test* database.");
  const previousKey = process.env.APP_ENCRYPTION_KEY;
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  const prisma = new PrismaClient(); const suffix = randomUUID();
  const userId = `telegram-user-${suffix}`, workspaceId = `telegram-workspace-${suffix}`, workflowId = `telegram-flow-${suffix}`, versionId = `telegram-version-${suffix}`, endpointId = `telegram-endpoint-${suffix}`;
  const path = `telegram-${suffix}`;
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Synthetic", slug: `telegram-${suffix}` } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic", isActive: true } });
    const graph = { nodes: [{ id: "telegram", type: "trigger.telegram.update", position: { x: 0, y: 0 }, config: { event: "message", chatMode: "all", allowedChatIds: "" } }], edges: [] };
    await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version: 1, status: "PUBLISHED", graph } });
    await prisma.workflow.update({ where: { id: workflowId }, data: { publishedVersionId: versionId } });
    await prisma.webhookEndpoint.create({ data: { id: endpointId, path, workflowId, workflowVersionId: versionId, secretHash: "synthetic-hash" } });
    const service = new ExecutionService(prisma as never, {} as never, {} as never);
    const input = { workflowId, workflowVersionId: versionId, endpointId, path, secretHash: "synthetic-hash", payload: { source: "telegram", event: "message", updateId: 9, message: { chatId: "123", messageId: 1, text: "Hello" } }, deliveryKey: "9" };
    const [first, second] = await Promise.all([service.createTelegramScheduledExecution(input), service.createTelegramScheduledExecution(input)]);
    assert.equal(first.id, second.id);
    assert.equal(await prisma.execution.count({ where: { workflowVersionId: versionId } }), 1);
    await assert.rejects(service.createTelegramScheduledExecution({ ...input, payload: { ...input.payload, message: { ...input.payload.message, text: "Changed" } } }), (error: unknown) => error instanceof ConflictException && (error.getResponse() as { code: string }).code === "WEBHOOK_DELIVERY_CONFLICT");
    // Independent update IDs may arrive out of order; neither receipt replaces
    // the other. Recovery must requeue only the one that never started.
    const earlier = await service.createTelegramScheduledExecution({ ...input, deliveryKey: "8", payload: { ...input.payload, updateId: 8 } });
    assert.notEqual(earlier.id, first.id);
    assert.equal((await service.createTelegramScheduledExecution({ ...input, deliveryKey: "8", payload: { ...input.payload, updateId: 8 } })).id, earlier.id);
    const old = new Date(Date.now() - 3 * 60_000);
    await prisma.execution.update({ where: { id: first.id }, data: { createdAt: old } });
    await prisma.execution.update({ where: { id: earlier.id }, data: { createdAt: old, status: "RUNNING", startedAt: old } });
    const scoped = { execution: { findMany: (args: Prisma.ExecutionFindManyArgs) => prisma.execution.findMany({ ...args, where: { AND: [args.where ?? {}, { workflowVersionId: versionId }] } }) } };
    const jobs: Array<{ executionId: string; mode: string; initialOnly: boolean }> = [];
    const recovery = new TelegramDeliveryRecoveryService(scoped as never, { ensureDispatched: async (job: { executionId: string; mode: string; initialOnly: boolean }) => { jobs.push(job); } } as never);
    await recovery.recover();
    assert.deepEqual(jobs, [{ executionId: first.id, mode: "live", initialOnly: true }]);
    await prisma.workflow.update({ where: { id: workflowId }, data: { isActive: false } });
    await assert.rejects(service.createTelegramScheduledExecution({ ...input, deliveryKey: "10", payload: { ...input.payload, updateId: 10 } }));
    assert.equal(await prisma.execution.count({ where: { workflowVersionId: versionId } }), 2);
    await prisma.workflow.update({ where: { id: workflowId }, data: { isActive: true } });
    await prisma.webhookEndpoint.update({ where: { id: endpointId }, data: { secretHash: "rotated" } });
    await assert.rejects(service.createTelegramScheduledExecution(input));
  } finally {
    await prisma.execution.deleteMany({ where: { workflowVersion: { workflowId } } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    if (previousKey === undefined) delete process.env.APP_ENCRYPTION_KEY; else process.env.APP_ENCRYPTION_KEY = previousKey;
  }
});
