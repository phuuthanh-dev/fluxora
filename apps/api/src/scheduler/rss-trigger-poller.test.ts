import assert from "node:assert/strict";
import test from "node:test";
import { RssTriggerPoller, rssFeedUrlHash, type RssCheckpoint, type RssTriggerStore } from "./rss-trigger-poller";
import { parseRssTriggerSnapshot } from "../execution/rss-trigger-snapshot";

const target = { workflowId: "workflow", versionId: "version", nodeId: "rss", url: "https://feeds.example.test/feed?lang=vi", pollMinutes: 5 };
const feed = (...ids: string[]) => `<rss><channel><title>News</title>${ids.map((id) => `<item><guid>${id}</guid><title>Title ${id}</title></item>`).join("")}</channel></rss>`;

function fixture(checkpoint?: RssCheckpoint) {
  const commits: Array<{ keys: string[]; observations: string[] }> = [];
  const failures: Array<{ code: string; retryable: boolean; retryAfterMs?: number }> = [];
  let releases = 0;
  const store: RssTriggerStore = {
    claim: async () => checkpoint ?? null,
    commit: async (_target, _token, snapshot, observations) => { commits.push({ keys: snapshot.keys, observations: observations.map((item) => item.key) }); return ["accepted-execution"]; },
    fail: async (_target, _token, failure) => { failures.push(failure); },
    release: async () => { releases++; },
  };
  return { store, commits, failures, releases: () => releases };
}

test("RSS baseline observes current items without creating deliveries", async () => {
  const f = fixture();
  const poller = new RssTriggerPoller(f.store, async () => new Response(feed("old"), { headers: { etag: '"fixture"' } }));
  const baseline = await poller.baseline(target);
  assert.deepEqual(baseline.keys, parseRssTriggerSnapshot(feed("old")).keys);
  assert.equal(baseline.etag, '"fixture"');
  assert.equal(f.commits.length, 0);
});

test("RSS poll sends observed entries to atomic store and retains conditional validators", async () => {
  const previous = parseRssTriggerSnapshot(feed("old"));
  const f = fixture({ feedUrlHash: rssFeedUrlHash(target.url), keys: previous.keys, etag: '"old"', lastModified: null });
  const poller = new RssTriggerPoller(f.store, async (_url, init) => {
    assert.equal((init.headers as Record<string, string>)["if-none-match"], '"old"');
    return new Response(feed("new", "old"), { headers: { etag: '"new"' } });
  });
  assert.deepEqual(await poller.poll(target), ["accepted-execution"]);
  assert.equal(f.commits[0]?.keys.length, 2);
  assert.deepEqual(f.commits[0]?.observations, parseRssTriggerSnapshot(feed("new")).keys);
  assert.equal(f.releases(), 1);
});

test("first poll after baseline never delivers items already present at activation", async () => {
  const baseline = parseRssTriggerSnapshot(feed("old", "older"));
  const checkpoint = { feedUrlHash: rssFeedUrlHash(target.url), keys: baseline.keys, etag: null, lastModified: null };
  const unchanged = fixture(checkpoint);
  await new RssTriggerPoller(unchanged.store, async () => new Response(feed("old", "older"))).poll(target);
  assert.deepEqual(unchanged.commits[0]?.observations, []);
  const added = fixture(checkpoint);
  await new RssTriggerPoller(added.store, async () => new Response(feed("new", "old", "older"))).poll(target);
  assert.deepEqual(added.commits[0]?.observations, parseRssTriggerSnapshot(feed("new")).keys);
});

test("304 retains the checkpoint; a non-overlapping feed stops without committing", async () => {
  const previous = parseRssTriggerSnapshot(feed("old"));
  const checkpoint = { feedUrlHash: rssFeedUrlHash(target.url), keys: previous.keys, etag: '"old"', lastModified: null };
  const unchanged = fixture(checkpoint);
  await new RssTriggerPoller(unchanged.store, async () => new Response(null, { status: 304 })).poll(target);
  assert.deepEqual(unchanged.commits[0], { keys: previous.keys, observations: [] });
  const gap = fixture(checkpoint);
  await new RssTriggerPoller(gap.store, async () => new Response(feed("new"))).poll(target);
  assert.equal(gap.commits.length, 0);
  assert.deepEqual(gap.failures, [{ code: "RSS_SNAPSHOT_GAP", retryable: false }]);
  assert.equal(gap.releases(), 1);
});

test("429 records Retry-After for the scheduler without retaining response content", async () => {
  const checkpoint = { feedUrlHash: rssFeedUrlHash(target.url), keys: [], etag: null, lastModified: null };
  const f = fixture(checkpoint);
  await new RssTriggerPoller(f.store, async () => new Response("private provider content", { status: 429, headers: { "retry-after": "120" } })).poll(target);
  assert.deepEqual(f.failures, [{ code: "RSS_HTTP_ERROR", retryable: true, retryAfterMs: 120_000 }]);
  assert.equal(f.commits.length, 0);
});
