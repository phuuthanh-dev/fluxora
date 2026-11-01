import { XMLParser, XMLValidator } from "fast-xml-parser";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";

const maxBytes = 1_000_000;
type Transport = (url: string, init: RequestInit) => Promise<Response>;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function text(value: unknown): string {
  const node = record(value);
  const content = node ? node["#text"] : value;
  return typeof content === "string" || typeof content === "number" ? String(content).trim().slice(0, 10_000) : "";
}

function link(value: unknown): string {
  const links = Array.isArray(value) ? value : [value];
  for (const candidate of links) {
    const node = record(candidate);
    if (node && node["@_rel"] && node["@_rel"] !== "alternate") continue;
    const result = node ? text(node["@_href"]) || text(node) : text(candidate);
    if (result) return result.slice(0, 2048);
  }
  return "";
}

async function readBounded(response: Response) {
  if (Number(response.headers.get("content-length")) > maxBytes) throw new NodeFailure("RESPONSE_TOO_LARGE", "Feed exceeds the size limit.", false);
  if (!response.body) throw new NodeFailure("INVALID_RESPONSE", "Feed response is empty.", false);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new NodeFailure("RESPONSE_TOO_LARGE", "Feed exceeds the size limit.", false);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

function hasUnsafeDeclaration(xml: string) {
  let offset = 0;
  while ((offset = xml.indexOf("<", offset)) !== -1) {
    const endMarker = xml.startsWith("<!--", offset) ? "-->"
      : xml.startsWith("<![CDATA[", offset) ? "]]>"
      : xml.startsWith("<?", offset) ? "?>" : null;
    if (endMarker) {
      const end = xml.indexOf(endMarker, offset + 2);
      // Fail closed even if the XML validator changes its behavior.
      if (end === -1) return true;
      offset = end + endMarker.length;
      continue;
    }
    if (/^<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml.slice(offset))) return true;
    offset += 1;
  }
  return false;
}

export function parseRssFeed(xml: string, limit: number) {
  // CDATA and comments are literal content, not XML declarations. Validate
  // first so malformed delimiters cannot hide a real DTD or entity declaration.
  if (XMLValidator.validate(xml) !== true) throw new NodeFailure("INVALID_RESPONSE", "Feed contains invalid or unsupported XML.", false);
  if (hasUnsafeDeclaration(xml)) throw new NodeFailure("INVALID_RESPONSE", "Feed contains invalid or unsupported XML.", false);
  let root: Record<string, unknown> | undefined;
  try { root = record(new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, maxNestedTags: 32 }).parse(xml)); }
  catch { throw new NodeFailure("INVALID_RESPONSE", "Feed contains invalid or unsupported XML.", false); }
  const rss = record(record(root?.rss)?.channel);
  const atom = record(root?.feed);
  if (!rss && !atom) throw new NodeFailure("INVALID_RESPONSE", "Expected an RSS 2.0 or Atom feed.", false);
  const container = rss ?? atom!;
  const rawItems = rss ? container.item : container.entry;
  const items = (rawItems === undefined ? [] : Array.isArray(rawItems) ? rawItems : [rawItems])
    .slice(0, limit).flatMap((item: unknown) => {
      const entry = record(item);
      if (!entry) return [];
      return [{ title: text(entry.title), link: link(entry.link), id: text(entry.guid ?? entry.id), publishedAt: text(entry.pubDate ?? entry.published ?? entry.updated), summary: text(entry.description ?? entry.summary) }];
    });
  return { title: text(container.title), items };
}

export async function executeRssRead(config: Record<string, unknown>, mode: "mock" | "live", transport: Transport = fetchSafeOutbound) {
  const url = typeof config.url === "string" ? config.url.trim() : "";
  const limit = config.limit === undefined ? 20 : config.limit;
  if (!url || url.length > 2048 || typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new NodeFailure("INVALID_INPUT", "Enter a public feed URL and a limit between 1 and 100.", false);
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("invalid URL");
  } catch { throw new NodeFailure("INVALID_INPUT", "Enter a valid public HTTP or HTTPS feed URL without embedded credentials.", false); }
  if (mode === "mock") return { status: "succeeded" as const, output: { title: "Example feed", items: [{ title: "Example item", link: "https://example.test/item", id: "example-item", publishedAt: "", summary: "Synthetic feed item" }] }, route: "success" as const };
  let response: Response;
  try { response = await transport(url, { method: "GET", headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(10_000) }); }
  catch (error) { throw nodeFailureFromOutboundPolicy(error); }
  if (!response.ok) throw new NodeFailure("HTTP_ERROR", `Feed returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
  let body: string;
  try { body = await readBounded(response); }
  catch (error) { throw nodeFailureFromOutboundPolicy(error); }
  return { status: "succeeded" as const, output: parseRssFeed(body, limit), route: "success" as const };
}
