import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { parseRssTriggerSnapshot } from "../execution/rss-trigger-snapshot";
import { rssFeedUrlHash } from "./rss-trigger-poller";
import { PrismaRssTriggerStore } from "./rss-trigger.store";

const feed = (...ids: string[]) => `<rss><channel><title>News</title>${ids.map((id) => `<item><guid>${id}</guid><title>${id}</title></item>`).join("")}</channel></rss>`;

test("RSS store commits one delivery and checkpoint under a fenced lease", { skip: process.env.FLUXORA_RSS_INTEGRATION !== "1" }, async () => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(database.pathname) || !["localhost", "127.0.0.1"].includes(database.hostname)) throw new Error("RSS integration requires a disposable local fluxora_*test* database.");
  const prisma = new PrismaClient();
  const suffix = randomUUID();
  const userId = `rss-user-${suffix}`, workspaceId = `rss-workspace-${suffix}`, workflowId = `rss-flow-${suffix}`, versionId = `rss-version-${suffix}`, nodeId = "rss";
  const target = { workflowId, versionId, nodeId, url: "https://example.test/feed?lang=vi", pollMinutes: 5 };
  try {
    await prisma.user.create({ data: { id: userId, email: `${suffix}@example.test` } });
    await prisma.workspace.create({ data: { id: workspaceId, ownerId: userId, name: "Synthetic", slug: `rss-${suffix}` } });
    await prisma.workflow.create({ data: { id: workflowId, workspaceId, name: "Synthetic", isActive: true } });
    const graph = { nodes: [{ id: nodeId, type: "trigger.rss.new-item", position: { x: 0, y: 0 }, config: { url: target.url, pollMinutes: target.pollMinutes } }], edges: [] };
    await prisma.workflowVersion.create({ data: { id: versionId, workflowId, version: 1, status: "PUBLISHED", graph } });
    await prisma.workflow.update({ where: { id: workflowId }, data: { publishedVersionId: versionId } });
    const baseline = parseRssTriggerSnapshot(feed("old"));
    const now = new Date();
    await prisma.$executeRaw`INSERT INTO "RssTriggerCheckpoint" ("workflowId", "nodeId", "workflowVersionId", "feedUrlHash", "snapshot", "updatedAt") VALUES (${workflowId}, ${nodeId}, ${versionId}, ${rssFeedUrlHash(target.url)}, ${JSON.stringify(baseline.keys)}::jsonb, ${now})`;
    await prisma.$executeRaw`INSERT INTO "RssTriggerDelivery" ("workflowId", "nodeId", "itemKey", "lastSeenAt") VALUES (${workflowId}, ${nodeId}, ${baseline.keys[0]!}, ${now})`;
    const store = new PrismaRssTriggerStore(prisma as never);
    const lease = "synthetic-lease";
    assert.ok(await store.claim(target, lease, now, new Date(now.getTime() + 60_000)));
    assert.equal(await store.claim(target, "other-lease", now, new Date(now.getTime() + 60_000)), null);
    const next = parseRssTriggerSnapshot(feed("new", "old"));
    const snapshot = { keys: next.keys, etag: null, lastModified: null };
    const accepted = await store.commit(target, lease, snapshot, next.observations, now);
    assert.equal(accepted?.length, 1);
    assert.equal(await prisma.execution.count({ where: { workflowVersionId: versionId } }), 1);
    const receipts = await prisma.$queryRaw<Array<{ itemKey: string; executionId: string | null }>>`SELECT "itemKey", "executionId" FROM "RssTriggerDelivery" WHERE "workflowId" = ${workflowId} AND "nodeId" = ${nodeId}`;
    assert.equal(receipts.length, 2);
    assert.equal(receipts.find((item) => item.itemKey === next.keys[0])?.executionId, accepted?.[0]);
    await store.release(target, lease);
    await prisma.$executeRaw`UPDATE "RssTriggerCheckpoint" SET "nextPollAt" = NULL WHERE "workflowId" = ${workflowId} AND "nodeId" = ${nodeId}`;
    assert.ok(await store.claim(target, "next-lease", now, new Date(now.getTime() + 60_000)));
    assert.deepEqual(await store.commit(target, "next-lease", snapshot, next.observations, now), []);
    await store.release(target, "next-lease");
    // A baseline item can leave and re-enter the current snapshot. The
    // persisted baseline receipt must still suppress it when it reappears.
    await prisma.$executeRaw`UPDATE "RssTriggerCheckpoint" SET "nextPollAt" = NULL WHERE "workflowId" = ${workflowId} AND "nodeId" = ${nodeId}`;
    assert.ok(await store.claim(target, "smaller-snapshot", now, new Date(now.getTime() + 60_000)));
    const smaller = parseRssTriggerSnapshot(feed("new"));
    assert.deepEqual(await store.commit(target, "smaller-snapshot", { keys: smaller.keys, etag: null, lastModified: null }, [], now), []);
    await store.release(target, "smaller-snapshot");
    await prisma.$executeRaw`UPDATE "RssTriggerCheckpoint" SET "nextPollAt" = NULL WHERE "workflowId" = ${workflowId} AND "nodeId" = ${nodeId}`;
    assert.ok(await store.claim(target, "returning-baseline", now, new Date(now.getTime() + 60_000)));
    assert.deepEqual(await store.commit(target, "returning-baseline", snapshot, next.observations.filter((item) => item.key === baseline.keys[0]), now), []);
    assert.equal(await prisma.execution.count({ where: { workflowVersionId: versionId } }), 1);
    await store.release(target, "returning-baseline");

    // Removing terminal execution history must leave the RSS receipt in place
    // so a still-retained item is not redelivered on the next snapshot.
    const executionId = accepted![0]!;
    await prisma.execution.update({ where: { id: executionId }, data: { status: "SUCCEEDED", completedAt: now } });
    await prisma.execution.delete({ where: { id: executionId } });
    const retained = await prisma.rssTriggerDelivery.findUniqueOrThrow({ where: { workflowId_nodeId_itemKey: { workflowId, nodeId, itemKey: next.keys[0]! } } });
    assert.equal(retained.executionId, null);
    await prisma.$executeRaw`UPDATE "RssTriggerCheckpoint" SET "nextPollAt" = NULL WHERE "workflowId" = ${workflowId} AND "nodeId" = ${nodeId}`;
    assert.ok(await store.claim(target, "after-history-retention", now, new Date(now.getTime() + 60_000)));
    assert.deepEqual(await store.commit(target, "after-history-retention", snapshot, next.observations, now), []);
    assert.equal(await prisma.execution.count({ where: { workflowVersionId: versionId } }), 0);
    await store.release(target, "after-history-retention");
    await prisma.workflow.update({ where: { id: workflowId }, data: { isActive: false } });
    assert.equal(await store.claim(target, "inactive", now, new Date(now.getTime() + 60_000)), null);
  } finally {
    await prisma.execution.deleteMany({ where: { workflowVersion: { workflowId } } });
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  }
});
