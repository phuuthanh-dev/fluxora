import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { PrismaService } from "../database/prisma.service";
import { liveCredentialRequirements } from "../execution/live-readiness";
import { NodeFailure } from "../execution/node-failure";
import { redactValue } from "../execution/redaction";
import { parseStoredWorkflowGraph } from "../workflows/workflow-graph";
import { rssFeedUrlHash, rssTargets, type RssCheckpoint, type RssObservation, type RssSnapshot, type RssTarget, type RssTriggerStore } from "./rss-trigger-poller";

// Bounded per trigger; old terminal receipts may later be seen as new again.
export const RSS_RECEIPT_RETENTION_DAYS = 30;
export const RSS_RECEIPT_LIMIT = 10_000;
type Row = { workflowVersionId: string; feedUrlHash: string; snapshot: unknown; etag: string | null; lastModified: string | null; state: string; leaseToken: string | null; leaseExpiresAt: Date | null };

export class PrismaRssTriggerStore implements RssTriggerStore {
  constructor(private readonly prisma: PrismaService) {}

  async claim(target: RssTarget, token: string, now: Date, expires: Date): Promise<RssCheckpoint | null> {
    const rows = await this.prisma.$queryRaw<Row[]>`UPDATE "RssTriggerCheckpoint" c SET "leaseToken" = ${token}, "leaseExpiresAt" = ${expires}, "updatedAt" = ${now} WHERE c."workflowId" = ${target.workflowId} AND c."nodeId" = ${target.nodeId} AND c."workflowVersionId" = ${target.versionId} AND c."state" = 'READY' AND (c."leaseExpiresAt" IS NULL OR c."leaseExpiresAt" <= ${now}) AND (c."nextPollAt" IS NULL OR c."nextPollAt" <= ${now}) AND EXISTS (SELECT 1 FROM "Workflow" w WHERE w.id = c."workflowId" AND w."isActive" = true AND w."archivedAt" IS NULL AND w."publishedVersionId" = c."workflowVersionId") RETURNING c.*`;
    const row = rows[0];
    if (!row) return null;
    if (!Array.isArray(row.snapshot) || row.snapshot.length > 100 || row.snapshot.some((key) => typeof key !== "string" || !/^[a-f0-9]{64}$/.test(key)) || new Set(row.snapshot).size !== row.snapshot.length) {
      await this.fail(target, token, { code: "RSS_CHECKPOINT_INVALID", retryable: false }, now);
      await this.release(target, token);
      throw new NodeFailure("RSS_CHECKPOINT_INVALID", "RSS checkpoint requires review.", false);
    }
    return { feedUrlHash: row.feedUrlHash, keys: row.snapshot as string[], etag: row.etag, lastModified: row.lastModified };
  }

  async commit(target: RssTarget, token: string, snapshot: RssSnapshot, observations: RssObservation[], now: Date) {
    return this.prisma.$transaction(async (tx) => {
      const workflows = await tx.$queryRaw<Array<{ isActive: boolean; archivedAt: Date | null; publishedVersionId: string | null; workspaceId: string }>>`SELECT "isActive", "archivedAt", "publishedVersionId", "workspaceId" FROM "Workflow" WHERE id = ${target.workflowId} FOR UPDATE`;
      const workflow = workflows[0];
      if (!workflow?.isActive || workflow.archivedAt || workflow.publishedVersionId !== target.versionId) return null;
      const checkpoints = await tx.$queryRaw<Array<Row & { validLease: boolean }>>`SELECT *, "leaseExpiresAt" > (clock_timestamp() AT TIME ZONE 'UTC') AS "validLease" FROM "RssTriggerCheckpoint" WHERE "workflowId" = ${target.workflowId} AND "nodeId" = ${target.nodeId} FOR UPDATE`;
      const checkpoint = checkpoints[0];
      if (!checkpoint || checkpoint.state !== "READY" || checkpoint.workflowVersionId !== target.versionId || checkpoint.leaseToken !== token || !checkpoint.validLease) return null;
      if (checkpoint.feedUrlHash !== rssFeedUrlHash(target.url)) throw new NodeFailure("RSS_FEED_CHANGED", "The feed changed; review the trigger before resetting it.", false);
      const version = await tx.workflowVersion.findUnique({ where: { id: target.versionId }, select: { workflowId: true, graph: true } });
      if (!version || version.workflowId !== target.workflowId) return null;
      const graph = parseStoredWorkflowGraph(version.graph);
      const current = rssTargets(target.workflowId, target.versionId, graph).find((item) => item.nodeId === target.nodeId);
      if (!current || rssFeedUrlHash(current.url) !== checkpoint.feedUrlHash || current.pollMinutes !== target.pollMinutes) throw new NodeFailure("RSS_FEED_CHANGED", "The feed changed; review the trigger before resetting it.", false);
      const requirements = liveCredentialRequirements(graph, target.nodeId);
      const ids = [...new Set(requirements.flatMap((item) => item.credentialId ? [item.credentialId] : []))];
      const credentials = ids.length ? await tx.$queryRaw<Array<{ id: string; provider: string }>>`SELECT id, provider::text AS provider FROM "Credential" WHERE "workspaceId" = ${workflow.workspaceId} AND id IN (${Prisma.join(ids)}) FOR SHARE` : [];
      const providers = new Map(credentials.map((item) => [item.id, item.provider]));
      if (requirements.some((item) => !item.credentialId || providers.get(item.credentialId) !== item.provider)) throw new NodeFailure("RSS_NOT_READY", "A required connection is unavailable.", false);
      if (snapshot.keys.length > 100 || snapshot.keys.some((key) => !/^[a-f0-9]{64}$/.test(key)) || observations.length > 100 || new Set(snapshot.keys).size !== snapshot.keys.length || new Set(observations.map((item) => item.key)).size !== observations.length || observations.some((item) => !snapshot.keys.includes(item.key))) throw new NodeFailure("RSS_CHECKPOINT_INVALID", "RSS checkpoint requires review.", false);
      // Touch the complete current snapshot even on HTTP 304 before retention.
      if (snapshot.keys.length) await tx.$executeRaw`UPDATE "RssTriggerDelivery" SET "lastSeenAt" = ${now} WHERE "workflowId" = ${target.workflowId} AND "nodeId" = ${target.nodeId} AND "itemKey" IN (${Prisma.join(snapshot.keys)})`;
      const cutoff = new Date(now.getTime() - RSS_RECEIPT_RETENTION_DAYS * 24 * 60 * 60_000);
      await tx.$executeRaw`DELETE FROM "RssTriggerDelivery" d WHERE d."workflowId" = ${target.workflowId} AND d."nodeId" = ${target.nodeId} AND d."lastSeenAt" < ${cutoff} AND (d."executionId" IS NULL OR EXISTS (SELECT 1 FROM "Execution" e WHERE e.id = d."executionId" AND e.status IN ('SUCCEEDED', 'FAILED', 'CANCELLED')))`;
      const keys = observations.map((item) => item.key);
      const rows = keys.length ? await tx.$queryRaw<Array<{ itemKey: string }>>`SELECT "itemKey" FROM "RssTriggerDelivery" WHERE "workflowId" = ${target.workflowId} AND "nodeId" = ${target.nodeId} AND "itemKey" IN (${Prisma.join(keys)})` : [];
      const seen = new Set(rows.map((row) => row.itemKey));
      const fresh = observations.filter((item) => !seen.has(item.key));
      const count = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM "RssTriggerDelivery" WHERE "workflowId" = ${target.workflowId} AND "nodeId" = ${target.nodeId}`;
      if (!count[0] || count[0].count + BigInt(fresh.length) > BigInt(RSS_RECEIPT_LIMIT)) throw new NodeFailure("RSS_RECEIPT_LIMIT", "RSS history is full; review the trigger before continuing.", false);
      const accepted = fresh.map((observation) => ({ observation, executionId: randomUUID() }));
      if (accepted.length) {
        await tx.execution.createMany({ data: accepted.map(({ observation, executionId }) => ({ id: executionId, workflowVersionId: target.versionId, mode: "LIVE", triggerNodeId: target.nodeId, idempotencyKey: `rss-v2:${randomUUID()}`, triggerData: redactValue({ source: target.source ?? "rss", item: observation.item }) as Prisma.InputJsonValue })) });
        await tx.$executeRaw`INSERT INTO "RssTriggerDelivery" ("workflowId", "nodeId", "itemKey", "lastSeenAt", "executionId") VALUES ${Prisma.join(accepted.map(({ observation, executionId }) => Prisma.sql`(${target.workflowId}, ${target.nodeId}, ${observation.key}, ${now}, ${executionId})`))}`;
      }
      const updated = await tx.$executeRaw`UPDATE "RssTriggerCheckpoint" SET "snapshot" = ${JSON.stringify(snapshot.keys)}::jsonb, "etag" = ${snapshot.etag}, "lastModified" = ${snapshot.lastModified}, "nextPollAt" = ${new Date(now.getTime() + target.pollMinutes * 60_000)}, "lastErrorCode" = NULL, "lastCheckedAt" = ${now}, "updatedAt" = ${now} WHERE "workflowId" = ${target.workflowId} AND "nodeId" = ${target.nodeId} AND "workflowVersionId" = ${target.versionId} AND "leaseToken" = ${token} AND "leaseExpiresAt" > (clock_timestamp() AT TIME ZONE 'UTC')`;
      if (updated !== 1) throw new NodeFailure("RSS_LEASE_EXPIRED", "RSS poll could not be committed before its lease expired.", true);
      return accepted.map((item) => item.executionId);
    }, { maxWait: 2000, timeout: 15_000 });
  }

  async fail(target: RssTarget, token: string, failure: { code: string; retryable: boolean; retryAfterMs?: number }, now: Date) {
    const delay = Math.max(target.pollMinutes * 60_000, failure.retryAfterMs ?? 0);
    const code = /^[A-Z0-9_]{1,80}$/.test(failure.code) ? failure.code : "RSS_POLL_FAILED";
    await this.prisma.$transaction(async (tx) => {
      // Serialize with deactivation and publishing in the same order as
      // commit(). A failed provider call must not poison a checkpoint after
      // its workflow has been deactivated or replaced.
      const workflows = await tx.$queryRaw<Array<{ isActive: boolean; archivedAt: Date | null; publishedVersionId: string | null }>>`SELECT "isActive", "archivedAt", "publishedVersionId" FROM "Workflow" WHERE id = ${target.workflowId} FOR UPDATE`;
      const workflow = workflows[0];
      if (!workflow?.isActive || workflow.archivedAt || workflow.publishedVersionId !== target.versionId) return;
      await tx.$executeRaw`UPDATE "RssTriggerCheckpoint" SET "state" = ${failure.retryable ? "READY" : "ERROR"}, "lastErrorCode" = ${code}, "lastCheckedAt" = ${now}, "nextPollAt" = ${new Date(now.getTime() + delay)}, "updatedAt" = ${now} WHERE "workflowId" = ${target.workflowId} AND "nodeId" = ${target.nodeId} AND "workflowVersionId" = ${target.versionId} AND "leaseToken" = ${token} AND "leaseExpiresAt" > (clock_timestamp() AT TIME ZONE 'UTC')`;
    }, { maxWait: 2000, timeout: 15_000 });
  }

  async release(target: RssTarget, token: string) {
    await this.prisma.$executeRaw`UPDATE "RssTriggerCheckpoint" SET "leaseToken" = NULL, "leaseExpiresAt" = NULL, "updatedAt" = NOW() WHERE "workflowId" = ${target.workflowId} AND "nodeId" = ${target.nodeId} AND "workflowVersionId" = ${target.versionId} AND "leaseToken" = ${token}`;
  }
}
