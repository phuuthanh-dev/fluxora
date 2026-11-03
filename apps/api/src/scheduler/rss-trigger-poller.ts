import { createHash, randomUUID } from "node:crypto";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "../execution/node-failure";
import { fetchPublicRss, parsePublicRssUrl } from "../execution/rss-public-transport";
import { readBoundedRss } from "../execution/rss-read";
import { parseRssTriggerSnapshot } from "../execution/rss-trigger-snapshot";
import { parseRetryAfter } from "../execution/retry-policy";
import type { WorkflowGraph } from "@workflow/contracts";

const leaseMs = 5 * 60_000;
export type RssTarget = { workflowId: string; versionId: string; nodeId: string; url: string; pollMinutes: number };
export type RssSnapshot = { keys: string[]; etag: string | null; lastModified: string | null };
export type RssCheckpoint = RssSnapshot & { feedUrlHash: string };
export type RssObservation = ReturnType<typeof parseRssTriggerSnapshot>["observations"][number];
/** Only a missing connection is safe to retry without replacing the snapshot.
 * Gaps, invalid checkpoints and other errors still require explicit review. */
export function canResumeRssCheckpoint(state: string, lastErrorCode: string | null | undefined) {
  return state === "READY" || (state === "ERROR" && lastErrorCode === "RSS_NOT_READY");
}
export interface RssTriggerStore {
  claim(target: RssTarget, leaseToken: string, now: Date, leaseUntil: Date): Promise<RssCheckpoint | null>;
  /** Fence active version and lease, persist accepted deliveries + snapshot in
   * one transaction, and return their execution IDs for queue dispatch. */
  commit(target: RssTarget, leaseToken: string, snapshot: RssSnapshot, observations: RssObservation[], now: Date): Promise<string[] | null>;
  fail(target: RssTarget, leaseToken: string, failure: { code: string; retryable: boolean; retryAfterMs?: number }, now: Date): Promise<void>;
  release(target: RssTarget, leaseToken: string): Promise<void>;
}
type Transport = (url: string, init: RequestInit) => Promise<Response>;

/** Derive polling targets only from the persisted graph, not from request data. */
export function rssTargets(workflowId: string, versionId: string, graph: WorkflowGraph): RssTarget[] {
  return graph.nodes.filter((node) => node.type === "trigger.rss.new-item").map((node) => {
    const url = typeof node.config.url === "string" ? node.config.url.trim() : "";
    const rawInterval = node.config.pollMinutes ?? 5;
    const pollMinutes = typeof rawInterval === "string" && /^\d+$/.test(rawInterval) ? Number(rawInterval) : rawInterval;
    if (typeof pollMinutes !== "number") throw new NodeFailure("INVALID_INPUT", "Choose a supported RSS polling interval.", false);
    const target = { workflowId, versionId, nodeId: node.id, url, pollMinutes };
    targetUrl(target);
    return target;
  });
}

function targetUrl(target: RssTarget) {
  if (![1, 5, 15, 60].includes(target.pollMinutes)) throw new NodeFailure("INVALID_INPUT", "Choose a supported RSS polling interval.", false);
  try { return parsePublicRssUrl(target.url).href; }
  catch (error) { throw nodeFailureFromOutboundPolicy(error); }
}
export function rssFeedUrlHash(url: string) {
  try { return createHash("sha256").update(parsePublicRssUrl(url).href).digest("hex"); }
  catch (error) { throw nodeFailureFromOutboundPolicy(error); }
}
function validator(value: string | null) {
  return value && value.length <= 512 && !/[\u0000-\u001f\u007f]/.test(value) ? value : null;
}

export class RssTriggerPoller {
  constructor(private readonly store: RssTriggerStore, private readonly transport: Transport = fetchPublicRss) {}

  /** Activation records current items without delivering historical entries. */
  async baseline(target: RssTarget) {
    const fetched = await this.fetch(target, null);
    if (!fetched) throw new NodeFailure("INVALID_RESPONSE", "RSS baseline requires a complete feed response.", false);
    return { feedUrlHash: rssFeedUrlHash(target.url), ...fetched.snapshot };
  }

  async poll(target: RssTarget, now = new Date()) {
    const token = randomUUID();
    const checkpoint = await this.store.claim(target, token, now, new Date(now.getTime() + leaseMs));
    if (!checkpoint) return null;
    try {
      if (checkpoint.feedUrlHash !== rssFeedUrlHash(target.url)) throw new NodeFailure("RSS_FEED_CHANGED", "The feed changed; review the trigger before resetting it.", false);
      const fetched = await this.fetch(target, checkpoint);
      const snapshot = fetched?.snapshot ?? checkpoint;
      if (fetched && checkpoint.keys.length && !checkpoint.keys.some((key) => snapshot.keys.includes(key))) {
        throw new NodeFailure("RSS_SNAPSHOT_GAP", "The feed no longer overlaps its previous snapshot; items may have been missed.", false);
      }
      // The activation baseline is a snapshot, not a set of delivery rows.
      // Exclude every entry already present in that snapshot before asking the
      // store to deduplicate older reappearing entries against its receipts.
      const previousKeys = new Set(checkpoint.keys);
      const observations = fetched?.observations.filter((item) => !previousKeys.has(item.key)) ?? [];
      return await this.store.commit(target, token, snapshot, observations, new Date());
    } catch (error) {
      const failure = error instanceof NodeFailure ? error : new NodeFailure("RSS_POLL_FAILED", "RSS poll could not be committed.", true);
      await this.store.fail(target, token, { code: failure.code, retryable: failure.retryable, ...(failure.retryAfterMs === undefined ? {} : { retryAfterMs: failure.retryAfterMs }) }, new Date());
      return null;
    } finally { await this.store.release(target, token); }
  }

  private async fetch(target: RssTarget, checkpoint: RssCheckpoint | null) {
    const url = targetUrl(target);
    const headers: Record<string, string> = { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" };
    if (checkpoint?.etag) headers["if-none-match"] = checkpoint.etag;
    if (checkpoint?.lastModified) headers["if-modified-since"] = checkpoint.lastModified;
    let response: Response;
    try { response = await this.transport(url, { method: "GET", headers, signal: AbortSignal.timeout(10_000) }); }
    catch (error) { throw nodeFailureFromOutboundPolicy(error); }
    if (response.status === 304 && checkpoint && (checkpoint.etag || checkpoint.lastModified)) return null;
    if (!response.ok) {
      const retryAfter = response.status === 429 || response.status === 503 ? parseRetryAfter(response.headers.get("retry-after")) : undefined;
      await response.body?.cancel().catch(() => undefined);
      if (retryAfter !== undefined && (!Number.isFinite(retryAfter) || retryAfter > 30 * 24 * 60 * 60_000)) throw new NodeFailure("RSS_RETRY_AFTER_UNSUPPORTED", "Feed requested a retry delay over 30 days; review the trigger.", false);
      throw new NodeFailure("RSS_HTTP_ERROR", `Feed returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status, retryAfter);
    }
    const xml = await readBoundedRss(response);
    const parsed = parseRssTriggerSnapshot(xml);
    return { observations: parsed.observations, snapshot: { keys: parsed.keys, etag: validator(response.headers.get("etag")), lastModified: validator(response.headers.get("last-modified")) } };
  }
}
