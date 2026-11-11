import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { ConflictException } from "@nestjs/common";
import { rssFeedUrlHash, rssTargets } from "../scheduler/rss-trigger-poller";
import { WorkflowService } from "./workflow.service";

test("RSS activation, republish and confirmed reset preserve or discard progress deliberately", { skip: process.env.FLUXORA_RSS_INTEGRATION !== "1" }, async () => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(database.pathname) || !["localhost", "127.0.0.1"].includes(database.hostname)) throw new Error("RSS integration requires a disposable local fluxora_*test* database.");
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const userId = `rss-owner-${suffix}`, workspaceId = `rss-space-${suffix}`, workflowId = `rss-flow-${suffix}`, versionId = `rss-version-${suffix}`, draftId = `rss-draft-${suffix}`;
  const key = "a".repeat(64);
  const graph = (url: string) => ({ nodes: [{ id: "rss", type: "trigger.rss.new-item", position: { x: 0, y: 0 }, config: { url, pollMinutes: "5" } }], edges: [] });
  const baselines = async (workflow: string, version: string, value: Parameters<typeof rssTargets>[2]) => rssTargets(workflow, version, value).map((target) => ({ target, baseline: { feedUrlHash: rssFeedUrlHash(target.url), keys: [key], etag: null, lastModified: null } }));
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Synthetic", slug: `rss-${suffix}` } });
    await prisma.workspaceMember.create({ data: { workspaceId, userId, role: "OWNER" } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic" } });
    const oldGraph = graph("https://example.test/feed?lang=vi");
    await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version: 1, status: "PUBLISHED", graph: oldGraph } });
    await prisma.workflowVersion.create({ data: { id: draftId, workflowId, version: 2, status: "DRAFT", graph: oldGraph } });
    await prisma.workflow.update({ where: { id: workflowId }, data: { publishedVersionId: versionId, draftVersionId: draftId } });
    const rss = { baselines, freshBaselines: baselines };
    const service = new WorkflowService(prisma as never, {} as never, undefined, rss as never);
    await service.activate(workflowId, userId);
    const first = await prisma.$queryRaw<Array<{ workflowVersionId: string }>>`SELECT "workflowVersionId" FROM "RssTriggerCheckpoint" WHERE "workflowId" = ${workflowId}`;
    assert.equal(first[0]?.workflowVersionId, versionId);
    await service.deactivate(workflowId, userId);
    await prisma.$executeRaw`UPDATE "RssTriggerCheckpoint" SET "state" = 'ERROR', "lastErrorCode" = 'RSS_NOT_READY' WHERE "workflowId" = ${workflowId}`;
    await service.activate(workflowId, userId);
    const recovered = await prisma.$queryRaw<Array<{ state: string; lastErrorCode: string | null; snapshot: unknown }>>`SELECT "state", "lastErrorCode", "snapshot" FROM "RssTriggerCheckpoint" WHERE "workflowId" = ${workflowId}`;
    assert.equal(recovered[0]?.state, "READY");
    assert.equal(recovered[0]?.lastErrorCode, null);
    assert.deepEqual(recovered[0]?.snapshot, [key]);
    assert.equal((await prisma.$queryRaw<Array<{ itemKey: string }>>`SELECT "itemKey" FROM "RssTriggerDelivery" WHERE "workflowId" = ${workflowId}`).length, 1);
    await service.deactivate(workflowId, userId);
    await prisma.$executeRaw`UPDATE "RssTriggerCheckpoint" SET "state" = 'ERROR', "lastErrorCode" = 'RSS_SNAPSHOT_GAP' WHERE "workflowId" = ${workflowId}`;
    await assert.rejects(service.activate(workflowId, userId), (error: unknown) => error instanceof ConflictException && (error.getResponse() as { code: string }).code === "RSS_TRIGGER_RECOVERY_REQUIRED");
    await prisma.$executeRaw`UPDATE "RssTriggerCheckpoint" SET "state" = 'READY', "lastErrorCode" = NULL WHERE "workflowId" = ${workflowId}`;
    await service.publish(workflowId, userId);
    const transferred = await prisma.$queryRaw<Array<{ workflowVersionId: string }>>`SELECT "workflowVersionId" FROM "RssTriggerCheckpoint" WHERE "workflowId" = ${workflowId}`;
    assert.equal(transferred[0]?.workflowVersionId, draftId);
    const receipts = await prisma.$queryRaw<Array<{ itemKey: string }>>`SELECT "itemKey" FROM "RssTriggerDelivery" WHERE "workflowId" = ${workflowId}`;
    assert.deepEqual(receipts.map((item) => item.itemKey), [key]);
    await service.updateDraft(workflowId, userId, { graph: graph("https://example.test/new-feed") });
    await assert.rejects(service.publish(workflowId, userId), (error: unknown) => error instanceof ConflictException && (error.getResponse() as { code: string }).code === "RSS_PUBLISH_GAP_CONFIRMATION");
    await service.publish(workflowId, userId, false, true);
    const removed = await prisma.$queryRaw<Array<{ workflowId: string }>>`SELECT "workflowId" FROM "RssTriggerCheckpoint" WHERE "workflowId" = ${workflowId}`;
    assert.equal(removed.length, 0);
    await service.activate(workflowId, userId);
    await service.deactivate(workflowId, userId);
    await assert.rejects(service.resetRssTrigger(workflowId, userId, false));
    assert.deepEqual(await service.resetRssTrigger(workflowId, userId, true), { success: true });
  } finally {
    await prisma.execution.deleteMany({ where: { workflowVersion: { workflowId } } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.auditLog.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});

test("multiple Steam checkpoints retain independent progress on republish", { skip: process.env.FLUXORA_RSS_INTEGRATION !== "1" }, async () => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(database.pathname) || !["localhost", "127.0.0.1"].includes(database.hostname)) throw new Error("RSS integration requires a disposable local fluxora_*test* database.");
  const prisma = new PrismaClient(), suffix = randomUUID();
  const userId = `multi-user-${suffix}`, workspaceId = `multi-space-${suffix}`, workflowId = `multi-flow-${suffix}`, versionId = `multi-version-${suffix}`, draftId = `multi-draft-${suffix}`;
  const steam = (id: string, appId: string) => ({ id, type: "trigger.steam.game-news" as const, position: { x: 0, y: 0 }, config: { appId, pollMinutes: 5 } });
  const graph = { nodes: [{ id: "cron", type: "trigger.cron" as const, position: { x: 0, y: 0 }, config: { expression: "16 17 * * *", timezone: "Asia/Ho_Chi_Minh" } }, steam("one", "1245620"), steam("two", "4115450"), steam("three", "2358720")], edges: [] };
  const baselines = async (workflow: string, version: string, value: Parameters<typeof rssTargets>[2]) => rssTargets(workflow, version, value).map((target, index) => ({ target, baseline: { feedUrlHash: rssFeedUrlHash(target.url), keys: [String(index + 1).repeat(64)], etag: null, lastModified: null } }));
  const rss = { baselines, freshBaselines: baselines };
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Synthetic", slug: `multi-${suffix}` } });
    await prisma.workspaceMember.create({ data: { workspaceId, userId, role: "OWNER" } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic" } });
    await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version: 1, status: "PUBLISHED", graph } });
    await prisma.workflowVersion.create({ data: { id: draftId, workflowId, version: 2, status: "DRAFT", graph } });
    await prisma.workflow.update({ where: { id: workflowId }, data: { publishedVersionId: versionId, draftVersionId: draftId } });
    const service = new WorkflowService(prisma as never, {} as never, undefined, rss as never);
    await service.activate(workflowId, userId);
    await service.deactivate(workflowId, userId);
    await service.publish(workflowId, userId);
    const rows = await prisma.$queryRaw<Array<{ nodeId: string; workflowVersionId: string; snapshot: unknown }>>`SELECT "nodeId", "workflowVersionId", snapshot FROM "RssTriggerCheckpoint" WHERE "workflowId" = ${workflowId} ORDER BY "nodeId"`;
    assert.deepEqual(rows.map((row) => [row.nodeId, row.workflowVersionId]), [["one", draftId], ["three", draftId], ["two", draftId]]);
    assert.deepEqual(rows.map((row) => row.snapshot), [["1".repeat(64)], ["3".repeat(64)], ["2".repeat(64)]]);
    await assert.rejects(service.resetRssTrigger(workflowId, userId, true));
    await service.resetRssTrigger(workflowId, userId, true, "two");
    const afterReset = await prisma.$queryRaw<Array<{ nodeId: string; snapshot: unknown }>>`SELECT "nodeId", snapshot FROM "RssTriggerCheckpoint" WHERE "workflowId" = ${workflowId} ORDER BY "nodeId"`;
    assert.deepEqual(afterReset.map((row) => row.snapshot), [["1".repeat(64)], ["3".repeat(64)], ["1".repeat(64)]]);
  } finally {
    await prisma.execution.deleteMany({ where: { workflowVersion: { workflowId } } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.auditLog.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});
