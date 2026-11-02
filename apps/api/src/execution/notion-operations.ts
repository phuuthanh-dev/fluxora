import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { readBoundedProviderJson } from "./provider-json";
import { maximumRetryDelayMs, parseRetryAfter } from "./retry-policy";
import { redactValue } from "./redaction";
import { validNotionCursor } from "./notion-search";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
type PageInput = { token: string; pageId: string };
type ListInput = { token: string; pageSize: number; cursor?: string };
type ChildrenInput = ListInput & { blockId: string };
type PropertyInput = ListInput & { pageId: string; propertyId: string };
type JsonObject = Record<string, unknown>;

const notionId = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
const outputLimit = 1_000_000;

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}
function validId(value: unknown): value is string { return typeof value === "string" && notionId.test(value); }
function validCursor(value: unknown): value is string {
  if (typeof value !== "string" || !validNotionCursor(value)) return false;
  // GET query parameters must also round-trip without replacing lone surrogates.
  try { encodeURIComponent(value); return true; } catch { return false; }
}
function normalizeCursor(value: unknown) { return value === "" ? undefined : value; }
function validateList(pageSize: unknown, cursor: unknown) {
  if (typeof pageSize !== "number" || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || (cursor !== undefined && !validCursor(cursor))) {
    throw new NodeFailure("INVALID_INPUT", "Choose a Notion page size between 1 and 100 and a valid cursor.", false);
  }
}
function propertyPath(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 256) throw new NodeFailure("INVALID_INPUT", "Enter a valid Notion property ID.", false);
  // Notion returns percent-encoded short IDs. Decode once and encode exactly once.
  try {
    const decoded = decodeURIComponent(value);
    if (!decoded || decoded.length > 256 || decoded === "." || decoded === ".." || /[\/\u0000-\u001f\u007f-\u009f]/.test(decoded)) throw new Error();
    return encodeURIComponent(decoded);
  } catch { throw new NodeFailure("INVALID_INPUT", "Enter a valid Notion property ID.", false); }
}
function assertOutputBound(value: unknown) {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > outputLimit) throw new NodeFailure("RESPONSE_TOO_LARGE", "Notion output exceeds the size limit.", false);
}

// Notion-hosted file URLs are bearer capabilities, even when their current
// format does not have a recognizable signature. For other text, conservatively
// remove HTTP URLs with a query or fragment: their parameters may be credentials.
// This also covers URLs embedded in rich text, link objects and property names.
function removeUrlCapabilities(value: unknown, depth = 0, credential?: string): unknown {
  if (depth > 100) throw new NodeFailure("INVALID_RESPONSE", "Notion returned an excessively nested response.", false);
  if (typeof value === "string") {
    const sanitized = value.replace(/https?:\/\/[^\s<>"']+/gi, (url) => /[?#]/.test(url) ? "[REDACTED]" : url);
    return credential ? sanitized.split(credential).join("[REDACTED]") : sanitized;
  }
  if (Array.isArray(value)) return value.map((item) => removeUrlCapabilities(item, depth + 1, credential));
  const record = object(value);
  if (!record) return value;
  const hostedFile = record.type === "file" && object(record.file);
  const entries: Array<[string, unknown]> = Object.entries(record).map(([key, item]): [string, unknown] => {
    const safeKey = removeUrlCapabilities(key, depth + 1, credential) as string;
    if (key === "file" && hostedFile) {
      const file = Object.fromEntries(Object.entries(hostedFile).map(([fileKey, fileValue]) => [
        removeUrlCapabilities(fileKey, depth + 1, credential) as string,
        fileKey === "url" ? "[REDACTED]" : removeUrlCapabilities(fileValue, depth + 1, credential),
      ]));
      return [safeKey, file];
    }
    return [safeKey, removeUrlCapabilities(item, depth + 1, credential)];
  });
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new NodeFailure("INVALID_RESPONSE", "Notion returned values that cannot be safely redacted without a key collision.", false);
  return Object.fromEntries(entries);
}

const privacyNotice = "Sensitive keys, credential echoes and temporary file URLs are redacted; HTTP URLs with a query or fragment are also redacted, including in text. Values and property names may change.";
const pageNotice = "Page properties may be incomplete. Retrieve and paginate individual properties for more complete values; rollups can require all pages and provider limits still apply.";
const childrenNotice = "Only direct children on this page are included; retrieve nested blocks and continue with nextCursor when hasMore is true.";
const propertyNotice = "A list contains one page of property items; continue with nextCursor when hasMore is true. Rollup calculations may be incomplete until the final page.";

function safeOutput<T extends Record<string, unknown>>(value: T, completeness: string, credential?: string): T & { outputInfo: { redaction: string; completeness: string } } {
  // Apply the runner's existing semantic redaction before exposing the result so
  // downstream steps see the same values as a resumed execution.
  const output = redactValue(removeUrlCapabilities({ ...value, outputInfo: { redaction: privacyNotice, completeness } }, 0, credential)) as T & { outputInfo: { redaction: string; completeness: string } };
  // If an unusually short credential collides with the response's structural
  // keys, fail closed rather than return a silently malformed output.
  if (!Object.keys(value).every((key) => Object.hasOwn(output, key)) || !Object.hasOwn(output, "outputInfo") || (credential && JSON.stringify(output).includes(credential))) return invalidResponse();
  assertOutputBound(output);
  return output;
}
function listQuery(pageSize: number, cursor?: string) {
  const query = new URLSearchParams({ page_size: String(pageSize) });
  if (cursor !== undefined) query.set("start_cursor", cursor);
  return query.toString();
}
async function request(path: string, token: string, transport: Transport): Promise<unknown> {
  if (typeof token !== "string" || !token || token.length > 4096 || /[\s\u0000-\u001f\u007f-\u009f]/.test(token)) throw new NodeFailure("CREDENTIAL_INVALID", "Notion connection requires a valid token.", false);
  let response: Response;
  try {
    response = await transport(`https://api.notion.com/v1/${path}`, {
      method: "GET", headers: { authorization: `Bearer ${token}`, "notion-version": "2022-06-28", accept: "application/json" }, signal: AbortSignal.timeout(10_000),
    });
  } catch (error) { throw nodeFailureFromOutboundPolicy(error); }
  if (!response.ok) {
    const retryAfterMs = response.status === 429 ? parseRetryAfter(response.headers.get("retry-after")) : undefined;
    // Provider error bodies are neither consumed nor returned; release them
    // before retrying so repeated failures do not hold transport resources.
    await response.body?.cancel().catch(() => undefined);
    throw new NodeFailure("HTTP_ERROR", `Notion returned ${response.status}.`, (response.status === 429 && (retryAfterMs === undefined || retryAfterMs <= maximumRetryDelayMs)) || response.status >= 500, response.status, retryAfterMs);
  }
  try { return await readBoundedProviderJson(response); }
  catch (error) {
    if (error instanceof NodeFailure) throw error;
    throw new NodeFailure("INVALID_RESPONSE", "Notion returned an invalid response.", false);
  }
}
function invalidResponse(): never { throw new NodeFailure("INVALID_RESPONSE", "Notion returned an invalid response.", false); }
function pageEnvelope(payload: unknown, pageSize: number, itemObject: string, credential: string) {
  const root = object(payload);
  if (!root || root.object !== "list" || !Array.isArray(root.results) || root.results.length > pageSize || typeof root.has_more !== "boolean" || (root.has_more ? !validCursor(root.next_cursor) : root.next_cursor !== null)) return invalidResponse();
  // Never advertise a continuation that persistence redaction would alter.
  if (typeof root.next_cursor === "string" && redactValue(removeUrlCapabilities(root.next_cursor, 0, credential)) !== root.next_cursor) return invalidResponse();
  if (!root.results.every((item: unknown) => object(item)?.object === itemObject)) return invalidResponse();
  return { root, results: root.results as JsonObject[], hasMore: root.has_more, nextCursor: root.next_cursor as string | null };
}

/** Retrieves redacted page metadata; some property values may be partial. */
export async function retrieveNotionPage(input: PageInput, transport: Transport = fetchSafeOutbound) {
  if (!validId(input.pageId)) throw new NodeFailure("INVALID_INPUT", "Enter a valid Notion page ID.", false);
  const page = object(await request(`pages/${input.pageId}`, input.token, transport));
  if (!page || page.object !== "page" || !validId(page.id) || page.id.replace(/-/g, "").toLowerCase() !== input.pageId.replace(/-/g, "").toLowerCase()) return invalidResponse();
  return safeOutput({ page }, pageNotice, input.token);
}

/** Retrieves one page of direct children. Nested blocks require separate calls. */
export async function listNotionBlockChildren(input: ChildrenInput, transport: Transport = fetchSafeOutbound) {
  if (!validId(input.blockId)) throw new NodeFailure("INVALID_INPUT", "Enter a valid Notion block ID.", false);
  const cursor = normalizeCursor(input.cursor);
  validateList(input.pageSize, cursor);
  const { results, hasMore, nextCursor } = pageEnvelope(await request(`blocks/${input.blockId}/children?${listQuery(input.pageSize, cursor as string | undefined)}`, input.token, transport), input.pageSize, "block", input.token);
  return safeOutput({ blocks: results, hasMore, nextCursor }, childrenNotice, input.token);
}

/** Retrieves one property item or one page of property items, including rollup metadata. */
export async function retrieveNotionPageProperty(input: PropertyInput, transport: Transport = fetchSafeOutbound) {
  if (!validId(input.pageId)) throw new NodeFailure("INVALID_INPUT", "Enter a valid Notion page ID.", false);
  const propertyId = propertyPath(input.propertyId);
  const cursor = normalizeCursor(input.cursor);
  validateList(input.pageSize, cursor);
  const payload = object(await request(`pages/${input.pageId}/properties/${propertyId}?${listQuery(input.pageSize, cursor as string | undefined)}`, input.token, transport));
  if (!payload) return invalidResponse();
  if (payload.object === "property_item") {
    if (typeof payload.id !== "string" || typeof payload.type !== "string" || !Object.hasOwn(payload, payload.type)) return invalidResponse();
    return safeOutput({ kind: "item" as const, item: payload, hasMore: false, nextCursor: null }, propertyNotice, input.token);
  }
  const { root, results, hasMore, nextCursor } = pageEnvelope(payload, input.pageSize, "property_item", input.token);
  const metadata = object(root.property_item);
  if (root.type !== "property_item" || !metadata || typeof metadata.id !== "string" || typeof metadata.type !== "string") return invalidResponse();
  // Never follow or return provider-supplied continuation URLs; use the validated cursor.
  const { next_url: _nextUrl, ...property } = metadata;
  return safeOutput({ kind: "list" as const, items: results, property, hasMore, nextCursor }, propertyNotice, input.token);
}

/** Entry point for future dispatcher integration; mock mode never opens the vault. */
export async function executeNotionOperation(config: Record<string, unknown>, operation: "retrievePage" | "listChildren" | "retrieveProperty", mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutbound) {
  if (operation !== "retrievePage" && ((Object.hasOwn(config, "cursor") && config.cursor === undefined) || (Object.hasOwn(config, "pageSize") && config.pageSize === undefined))) {
    throw new NodeFailure("INVALID_INPUT", "Notion pagination could not be resolved.", false);
  }
  const pageId = typeof config.pageId === "string" ? config.pageId : "";
  const blockId = typeof config.blockId === "string" ? config.blockId : "";
  const propertyId = config.propertyId;
  const pageSize = config.pageSize === undefined ? 20 : config.pageSize;
  const cursor = normalizeCursor(config.cursor);
  if (operation !== "retrievePage" && operation !== "listChildren" && operation !== "retrieveProperty") throw new NodeFailure("INVALID_INPUT", "Choose a supported Notion operation.", false);
  if (operation === "listChildren" ? !validId(blockId) : !validId(pageId)) throw new NodeFailure("INVALID_INPUT", "Enter a valid Notion page or block ID.", false);
  if (operation !== "retrievePage") validateList(pageSize, cursor);
  if (operation === "retrieveProperty") propertyPath(propertyId);
  if (mode === "mock") {
    const output = operation === "retrievePage" ? safeOutput({ page: { object: "page", id: pageId, properties: {} } }, pageNotice)
      : operation === "listChildren" ? safeOutput({ blocks: [], hasMore: false, nextCursor: null }, childrenNotice)
      : safeOutput({ kind: "item" as const, item: { object: "property_item", id: propertyId, type: "number", number: 1 }, hasMore: false, nextCursor: null }, propertyNotice);
    return { status: "succeeded" as const, output, route: "success" as const };
  }
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Notion connection.", false);
  const credential = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.NOTION);
  const token = typeof credential.token === "string" ? credential.token : "";
  const output = operation === "retrievePage" ? await retrieveNotionPage({ token, pageId }, transport)
    : operation === "listChildren" ? await listNotionBlockChildren({ token, blockId, pageSize: pageSize as number, cursor: cursor as string | undefined }, transport)
    : await retrieveNotionPageProperty({ token, pageId, propertyId: propertyId as string, pageSize: pageSize as number, cursor: cursor as string | undefined }, transport);
  return { status: "succeeded" as const, output, route: "success" as const };
}
