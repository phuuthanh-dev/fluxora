import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { NodeFailure } from "./node-failure";
import { parseRssFeed } from "./rss-read";
import { isSensitiveRssParameter } from "./rss-public-transport";
import { redactValue } from "./redaction";

const maxItems = 100;
type Item = ReturnType<typeof parseRssFeed>["items"][number];
const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const rawText = (value: unknown): string => {
  const content = record(value)?.["#text"] ?? value;
  return typeof content === "string" || typeof content === "number" ? String(content).trim() : "";
};
const hash = (parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");

function rawLink(value: unknown) {
  for (const item of Array.isArray(value) ? value : [value]) {
    const node = record(item);
    if (node?.["@_rel"] && node["@_rel"] !== "alternate") continue;
    const link = node ? rawText(node["@_href"]) || rawText(node) : rawText(item);
    if (link) return link;
  }
  return "";
}

function identityText(value: unknown) {
  const node = record(value);
  if (Array.isArray(value) || (node && Object.keys(node).some((key) => key !== "#text" && !key.startsWith("@_")))) throw new NodeFailure("RSS_IDENTITY_UNSUPPORTED", "An anonymous feed item has unsupported nested content.", false);
  return rawText(value);
}

/** Identifiers use the full raw content, never the display-truncated item. */
function itemKey(raw: unknown) {
  const entry = record(raw);
  if (!entry) throw new NodeFailure("INVALID_RESPONSE", "Feed contains an unreadable item.", false);
  const id = rawText(entry.guid ?? entry.id);
  if (id) return hash(["id", id]);
  const link = rawLink(entry.link);
  if (link) return hash(["link", link]);
  const parts = [identityText(entry.title), identityText(entry.pubDate ?? entry.published ?? entry.updated), identityText(entry.description ?? entry.summary ?? entry.content)];
  if (parts.every((value) => !value)) throw new NodeFailure("RSS_IDENTITY_MISSING", "Feed contains an item without a usable identity.", false);
  return hash(["content", ...parts]);
}

/** Preserve ordinary query strings; remove known credential parameters before
 * exposing feed-provided links. Links are data and are not fetched here. */
export function safeRssItemLink(value: string): string {
  if (!value || value.length > 10_000 || /[\u0000-\u001f\u007f]/.test(value)) return "";
  let url: URL;
  try { url = new URL(value, "https://relative-rss.invalid/"); } catch { return ""; }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
  const names = [...url.searchParams.keys()].filter(isSensitiveRssParameter);
  const sensitiveFragment = /(?:access[_-]?token|api[_-]?key|password|secret|signature|token)=/i.test(url.hash);
  if (!names.length && !sensitiveFragment) return value.slice(0, 2048);
  for (const name of names) url.searchParams.delete(name);
  if (sensitiveFragment) url.hash = "";
  if (url.origin !== "https://relative-rss.invalid") return url.href.slice(0, 2048);
  const path = value.startsWith("/") ? url.pathname : url.pathname.replace(/^\//, "");
  return `${path}${url.search}${url.hash}`.slice(0, 2048);
}

function sanitizeText(value: string) {
  return value.replace(/https?:\/\/[^\s<>"']+/gi, (url) => safeRssItemLink(url));
}

function sanitizedItem(item: Item, raw: unknown): Item {
  const entry = record(raw);
  return redactValue({ id: sanitizeText(item.id), link: safeRssItemLink(rawLink(entry?.link)), title: sanitizeText(item.title), publishedAt: sanitizeText(item.publishedAt), summary: sanitizeText(item.summary) }) as Item;
}

/** A snapshot is bounded and all-or-nothing: malformed or ambiguous identity
 * cannot silently advance the polling checkpoint. */
export function parseRssTriggerSnapshot(xml: string) {
  const feed = parseRssFeed(xml, maxItems + 1); // validates XML, DTDs and nesting first
  if (feed.items.length > maxItems) throw new NodeFailure("RSS_ITEM_LIMIT", "Feed exceeds the item limit; no progress was saved.", false);
  let root: Record<string, unknown> | undefined;
  try { root = record(new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, maxNestedTags: 32, parseTagValue: false }).parse(xml)); }
  catch { throw new NodeFailure("INVALID_RESPONSE", "Feed contains invalid or unsupported XML.", false); }
  const rss = record(record(root?.rss)?.channel), atom = record(root?.feed);
  const raw = rss ? rss.item : atom?.entry;
  const items = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
  if (items.length !== feed.items.length) throw new NodeFailure("INVALID_RESPONSE", "Feed contains an unreadable item.", false);
  const observations = feed.items.map((item, index) => ({ key: itemKey(items[index]), item: sanitizedItem(item, items[index]) }));
  if (new Set(observations.map((item) => item.key)).size !== observations.length) throw new NodeFailure("RSS_DUPLICATE_IDENTITY", "Feed contains duplicate item identities.", false);
  return { observations, keys: observations.map((item) => item.key) };
}
