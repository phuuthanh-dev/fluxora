import assert from "node:assert/strict";
import test from "node:test";
import { RssTriggerService } from "./rss-trigger.service";
import { rssFeedUrlHash } from "./rss-trigger-poller";

const graph = { nodes: [{ id: "rss", type: "trigger.rss.new-item", position: { x: 0, y: 0 }, config: { url: "https://example.test/feed?lang=vi", pollMinutes: "5" } }], edges: [] } as const;

test("RSS reactivation reuses the saved checkpoint without fetching the feed", async () => {
  const prisma = { $queryRaw: async () => [{ feedUrlHash: rssFeedUrlHash("https://example.test/feed?lang=vi"), state: "READY" }] };
  const service = new RssTriggerService(prisma as never, {} as never);
  Object.defineProperty(service, "poller", { value: { baseline: async () => { throw new Error("unexpected request"); } } });
  const result = await service.baselines("workflow", "version", graph as never);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.baseline, null);
});

test("RSS can resume a connection error without resetting the checkpoint, but not a data gap", async () => {
  let lastErrorCode = "RSS_NOT_READY";
  const prisma = { $queryRaw: async () => [{ feedUrlHash: rssFeedUrlHash("https://example.test/feed?lang=vi"), state: "ERROR", lastErrorCode }] };
  const service = new RssTriggerService(prisma as never, {} as never);
  Object.defineProperty(service, "poller", { value: { baseline: async () => { throw new Error("checkpoint must not be replaced"); } } });
  assert.equal((await service.baselines("workflow", "version", graph as never))[0]?.baseline, null);
  lastErrorCode = "RSS_SNAPSHOT_GAP";
  await assert.rejects(service.baselines("workflow", "version", graph as never), /Review the RSS trigger/);
});

test("RSS recovery keeps trigger node identity and uses initial-only jobs", async () => {
  const prisma = { $queryRaw: async () => [{ id: "execution", nodeId: "rss" }] };
  const jobs: unknown[] = [];
  const service = new RssTriggerService(prisma as never, { ensureDispatched: async (job: unknown) => { jobs.push(job); } } as never);
  await service.recoverQueued();
  assert.deepEqual(jobs, [{ executionId: "execution", mode: "live", startNodeIds: ["rss"], initialOnly: true }]);
});

test("RSS scheduler dispatches only executions accepted by the transactional store", async () => {
  const prisma = { $queryRaw: async () => [], workflowVersion: { findMany: async () => [{ id: "version", workflowId: "workflow", graph }] } };
  const jobs: unknown[] = [];
  const service = new RssTriggerService(prisma as never, { ensureDispatched: async (job: unknown) => { jobs.push(job); } } as never);
  Object.defineProperty(service, "poller", { value: { poll: async () => ["accepted"] } });
  await service.tick();
  assert.deepEqual(jobs, [{ executionId: "accepted", mode: "live", startNodeIds: ["rss"], initialOnly: true }]);
});
