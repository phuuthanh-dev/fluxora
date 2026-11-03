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
async function request(path: string, token: string, transport: Transport, options?: { version: string; body?: Record<string, unknown> }): Promise<unknown> {
  if (typeof token !== "string" || !token || token.length > 4096 || /[\s\u0000-\u001f\u007f-\u009f]/.test(token)) throw new NodeFailure("CREDENTIAL_INVALID", "Notion connection requires a valid token.", false);
  let response: Response;
  try {
    response = await transport(`https://api.notion.com/v1/${path}`, {
      method: options?.body ? "POST" : "GET", headers: { authorization: `Bearer ${token}`, "notion-version": options?.version ?? "2022-06-28", accept: "application/json", ...(options?.body ? { "content-type": "application/json" } : {}) }, ...(options?.body ? { body: JSON.stringify(options.body) } : {}), signal: AbortSignal.timeout(10_000),
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

/** Return bounded metadata only, scoped to the selected page; never return values. */
export async function listNotionPageProperties(input: PageInput, transport: Transport = fetchSafeOutbound) {
  if (!validId(input.pageId)) throw new NodeFailure("INVALID_INPUT", "Enter a valid Notion page ID.", false);
  const page = object(await request(`pages/${input.pageId}`, input.token, transport));
  if (!page || page.object !== "page" || !validId(page.id) || page.id.replace(/-/g, "").toLowerCase() !== input.pageId.replace(/-/g, "").toLowerCase()) return invalidResponse();
  const properties = object(page.properties);
  if (!properties) return invalidResponse();
  const options: Array<{ id: string; name: string }> = [];
  const ids = new Set<string>();
  let omitted = false;
  for (const [name, raw] of Object.entries(properties)) {
    const property = object(raw);
    if (!property || typeof property.id !== "string" || !property.id || property.id.includes(input.token)) { omitted = true; continue; }
    let canonicalId: string;
    try { canonicalId = propertyPath(property.id); } catch { omitted = true; continue; }
    if (decodeURIComponent(canonicalId).includes(input.token) || ids.has(canonicalId)) { omitted = true; continue; }
    if (options.length >= 100) { omitted = true; continue; }
    const label = name.split(input.token).join("[REDACTED]").slice(0, 200);
    options.push({ id: property.id, name: label || "Untitled property" });
    ids.add(canonicalId);
  }
  return { properties: options, hasMore: omitted, ...(omitted ? { warning: "Some properties could not be listed. Enter the property ID manually if needed." } : {}) };
}

/** Search current data sources without changing the API version of existing page nodes. */
export async function searchNotionDataSources(input: ListInput & { query: string }, transport: Transport = fetchSafeOutbound) {
  validateList(input.pageSize, input.cursor);
  if (typeof input.query !== "string" || input.query.length > 200) throw new NodeFailure("INVALID_INPUT", "Enter a search term of at most 200 characters.", false);
  const payload = await request("search", input.token, transport, { version: "2025-09-03", body: { query: input.query, page_size: input.pageSize, filter: { property: "object", value: "data_source" }, ...(input.cursor ? { start_cursor: input.cursor } : {}) } });
  const { results, hasMore, nextCursor } = pageEnvelope(payload, input.pageSize, "data_source", input.token);
  const sources = results.map((source) => {
    if (!validId(source.id) || source.id.includes(input.token)) return invalidResponse();
    const title = Array.isArray(source.title) ? source.title.map((part: unknown) => typeof object(part)?.plain_text === "string" ? object(part)!.plain_text : "").join("") : "";
    return { id: source.id, name: title.split(input.token).join("[REDACTED]").slice(0, 300) || "Untitled data source" };
  });
  return { sources, hasMore, nextCursor };
}

/** Schema discovery exposes only properties the guided filter supports. */
export async function listNotionDataSourceProperties(input: { token: string; dataSourceId: string }, transport: Transport = fetchSafeOutbound) {
  if (!validId(input.dataSourceId)) throw new NodeFailure("INVALID_INPUT", "Choose a valid Notion data source.", false);
  const source = object(await request(`data_sources/${input.dataSourceId}`, input.token, transport, { version: "2025-09-03" }));
  if (!source || source.object !== "data_source" || !validId(source.id) || source.id.replace(/-/g, "").toLowerCase() !== input.dataSourceId.replace(/-/g, "").toLowerCase()) return invalidResponse();
  const properties = object(source.properties);
  if (!properties) return invalidResponse();
  const result: Array<{ id: string; name: string }> = [];
  const ids = new Set<string>();
  let omitted = false;
  for (const [name, raw] of Object.entries(properties)) {
    const property = object(raw);
    if (!property || typeof property.type !== "string" || !["status", "select", "checkbox"].includes(property.type)) continue;
    if (typeof property.id !== "string" || !property.id || property.id.includes(input.token)) { omitted = true; continue; }
    let canonicalId: string;
    try { canonicalId = propertyPath(property.id); } catch { omitted = true; continue; }
    if (decodeURIComponent(canonicalId).includes(input.token) || ids.has(canonicalId)) { omitted = true; continue; }
    if (result.length >= 100) { omitted = true; continue; }
    result.push({ id: property.id, name: `${name.split(input.token).join("[REDACTED]").slice(0, 180) || "Untitled"} · ${property.type}` });
    ids.add(canonicalId);
  }
  return { properties: result, ...(omitted ? { warning: "Some properties could not be listed. Enter a property ID manually if needed." } : {}) };
}

/** Option names are the filter values. Never alter a name into a different query. */
export async function listNotionDataSourceOptions(input: { token: string; dataSourceId: string; propertyId: string; mode: string }, transport: Transport = fetchSafeOutbound) {
  if (!validId(input.dataSourceId) || !["status", "select"].includes(input.mode)) throw new NodeFailure("INVALID_INPUT", "Choose a data source and a status or select property.", false);
  const target = propertyPath(input.propertyId);
  const source = object(await request(`data_sources/${input.dataSourceId}`, input.token, transport, { version: "2025-09-03" }));
  if (!source || source.object !== "data_source" || !validId(source.id) || source.id.replace(/-/g, "").toLowerCase() !== input.dataSourceId.replace(/-/g, "").toLowerCase()) return invalidResponse();
  const properties = object(source.properties);
  if (!properties) return invalidResponse();
  const matches = Object.values(properties).flatMap((raw) => {
    const property = object(raw);
    if (!property || property.type !== input.mode || typeof property.id !== "string") return [];
    try { return propertyPath(property.id) === target ? [property] : []; } catch { return []; }
  });
  if (matches.length !== 1) throw new NodeFailure("INVALID_INPUT", "Choose a property matching the selected filter type.", false);
  const schema = object(matches[0]![input.mode]);
  if (!schema || !Array.isArray(schema.options)) return invalidResponse();
  const values: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();
  let omitted = false;
  for (const raw of schema.options) {
    const name = object(raw)?.name;
    if (typeof name !== "string" || !name || name.length > 200 || name.includes(input.token) || /[\u0000-\u001f\u007f-\u009f]/.test(name) || seen.has(name)) { omitted = true; continue; }
    if (values.length >= 100) { omitted = true; continue; }
    seen.add(name);
    values.push({ id: name, name });
  }
  return { options: values, ...(omitted ? { warning: "Some options could not be listed. Enter the exact value manually if needed." } : {}) };
}

type DataSourceSort = "provider" | "created-newest" | "created-oldest" | "edited-newest" | "edited-oldest";
type DataSourceFilter = { property: string; mode: "status" | "select" | "checkbox"; value: string };
type DataSourceOptions = { sort: DataSourceSort; editedAfter?: string; propertyFilter?: DataSourceFilter };
function dataSourceOptions(sort: unknown, editedAfter: unknown, mode: unknown = "none", property?: unknown, value?: unknown): DataSourceOptions {
  if (typeof sort !== "string" || !["provider", "created-newest", "created-oldest", "edited-newest", "edited-oldest"].includes(sort)) throw new NodeFailure("INVALID_INPUT", "Choose a valid Notion sort order.", false);
  if (editedAfter !== undefined && (typeof editedAfter !== "string" || (editedAfter !== "" && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/i.test(editedAfter) || !Number.isFinite(Date.parse(editedAfter)))))) throw new NodeFailure("INVALID_INPUT", "Enter a valid edited-after time with a timezone.", false);
  if (typeof mode !== "string" || !["none", "status", "select", "checkbox"].includes(mode)) throw new NodeFailure("INVALID_INPUT", "Choose a supported property filter type.", false);
  let propertyFilter: DataSourceFilter | undefined;
  if (mode !== "none") {
    if (typeof property !== "string" || typeof value !== "string" || !value || value.length > 200 || (mode === "checkbox" && value !== "true" && value !== "false")) throw new NodeFailure("INVALID_INPUT", "Choose a property and a valid filter value.", false);
    propertyPath(property);
    propertyFilter = { property, mode: mode as DataSourceFilter["mode"], value };
  }
  return { sort: sort as DataSourceSort, ...(typeof editedAfter === "string" && editedAfter ? { editedAfter } : {}), ...(propertyFilter ? { propertyFilter } : {}) };
}

/** Read one bounded page; Notion may cap the whole query even when hasMore is false. */
export async function queryNotionDataSource(input: ListInput & { dataSourceId: string; sort?: DataSourceSort; editedAfter?: string; propertyFilter?: DataSourceFilter }, transport: Transport = fetchSafeOutbound) {
  if (!validId(input.dataSourceId)) throw new NodeFailure("INVALID_INPUT", "Choose a valid Notion data source.", false);
  validateList(input.pageSize, input.cursor);
  const options = dataSourceOptions(input.sort ?? "provider", input.editedAfter, input.propertyFilter?.mode ?? "none", input.propertyFilter?.property, input.propertyFilter?.value);
  const sort = options.sort === "provider" ? undefined : { timestamp: options.sort.startsWith("created-") ? "created_time" : "last_edited_time", direction: options.sort.endsWith("newest") ? "descending" : "ascending" };
  const filters: Record<string, unknown>[] = [];
  if (options.editedAfter) filters.push({ timestamp: "last_edited_time", last_edited_time: { after: options.editedAfter } });
  if (options.propertyFilter) filters.push({ property: options.propertyFilter.property, [options.propertyFilter.mode]: { equals: options.propertyFilter.mode === "checkbox" ? options.propertyFilter.value === "true" : options.propertyFilter.value } });
  const filter = filters.length > 1 ? { and: filters } : filters[0];
  const payload = object(await request(`data_sources/${input.dataSourceId}/query`, input.token, transport, { version: "2025-09-03", body: { page_size: input.pageSize, ...(input.cursor ? { start_cursor: input.cursor } : {}), ...(sort ? { sorts: [sort] } : {}), ...(filter ? { filter } : {}) } }));
  if (!payload || payload.object !== "list" || !Array.isArray(payload.results) || payload.results.length > input.pageSize || typeof payload.has_more !== "boolean" || (payload.has_more ? !validCursor(payload.next_cursor) : payload.next_cursor !== null)) return invalidResponse();
  if (!payload.results.every((value: unknown) => ["page", "data_source"].includes(String(object(value)?.object)))) return invalidResponse();
  if (typeof payload.next_cursor === "string" && redactValue(removeUrlCapabilities(payload.next_cursor, 0, input.token)) !== payload.next_cursor) return invalidResponse();
  const status = object(payload.request_status);
  if (Object.hasOwn(payload, "request_status") && !status) return invalidResponse();
  if (status && status.type !== "complete" && status.type !== "incomplete") return invalidResponse();
  const completeness = status?.type === "incomplete" ? "incomplete" : status?.type === "complete" ? "complete" : "unknown";
  return safeOutput({ results: payload.results, hasMore: payload.has_more, nextCursor: payload.next_cursor as string | null, queryCompleteness: completeness }, "A page can have fewer results than requested; queryCompleteness describes the provider's overall result cap, not whether this page has a successor.", input.token);
}

export async function executeNotionDataSourceQuery(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutbound) {
  if (["pageSize", "cursor", "sort", "editedAfter", "filterMode", "filterProperty", "filterValue"].some((key) => Object.hasOwn(config, key) && config[key] === undefined)) throw new NodeFailure("INVALID_INPUT", "Notion query settings could not be resolved.", false);
  const dataSourceId = config.dataSourceId;
  const pageSize = config.pageSize === undefined ? 20 : config.pageSize;
  const cursor = normalizeCursor(config.cursor);
  if (!validId(dataSourceId)) throw new NodeFailure("INVALID_INPUT", "Choose a valid Notion data source.", false);
  validateList(pageSize, cursor);
  const options = dataSourceOptions(Object.hasOwn(config, "sort") ? config.sort : "provider", config.editedAfter, Object.hasOwn(config, "filterMode") ? config.filterMode : "none", config.filterProperty, config.filterValue);
  if (mode === "mock") return { status: "succeeded" as const, output: { results: [], hasMore: false, nextCursor: null, queryCompleteness: "unknown" as const }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Notion connection.", false);
  const credential = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.NOTION);
  const token = typeof credential.token === "string" ? credential.token : "";
  return { status: "succeeded" as const, output: await queryNotionDataSource({ token, dataSourceId, pageSize: pageSize as number, ...options, ...(cursor ? { cursor: cursor as string } : {}) }, transport), route: "success" as const };
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
