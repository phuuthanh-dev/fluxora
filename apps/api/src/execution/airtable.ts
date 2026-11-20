import { nodeConfigIssues } from "@workflow/contracts";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound, fetchSafeOutboundWrite, wasOutboundRedirected } from "./outbound-url-policy";
import { readProviderJson, uncertainDelivery } from "./provider-request-policy";
import { assertNoCredentialInProviderValue } from "./provider-credential-safety";
import { redactValue } from "./redaction";
import { maximumRetryDelayMs, parseRetryAfter } from "./retry-policy";
import { preservesJsonDecimal } from "./json-decimal";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
type Operation = "list-records" | "get-record" | "create-record" | "update-record";
const object = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const id = (value: unknown, prefix: string): value is string => typeof value === "string" && new RegExp(`^${prefix}[A-Za-z0-9]{5,64}$`).test(value);

async function request(token: string, path: string, method: "GET" | "POST" | "PATCH", body?: object, read: Transport = fetchSafeOutbound, write: Transport = fetchSafeOutboundWrite) {
  if (!token || token.length > 4096 || /[\s\u0000-\u001f\u007f]/.test(token)) throw new NodeFailure("CREDENTIAL_INVALID", "Reconnect the Airtable account.", false);
  const writing = method !== "GET";
  let response: Response;
  try { response = await (writing ? write : read)(`https://api.airtable.com/v0/${path}`, { method, headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(writing ? { "content-type": "application/json" } : {}) }, ...(writing ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10_000) }); }
  catch (error) { if (writing) throw uncertainDelivery("Airtable"); throw nodeFailureFromOutboundPolicy(error); }
  if (writing && (wasOutboundRedirected(response) || response.status >= 300 && response.status < 400 || response.status === 408 || response.status === 429 || response.status >= 500)) { await response.body?.cancel().catch(() => undefined); throw uncertainDelivery("Airtable", response.status); }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    const delay = response.status === 429 ? parseRetryAfter(response.headers.get("retry-after")) : undefined;
    throw new NodeFailure("HTTP_ERROR", `Airtable returned ${response.status}.`, !writing && (response.status >= 500 || response.status === 429 && delay !== undefined && delay <= maximumRetryDelayMs), response.status, delay);
  }
  const result = await readProviderJson(response, "Airtable", writing);
  try { assertNoCredentialInProviderValue(result, token); }
  catch (error) { if (writing) throw uncertainDelivery("Airtable"); throw error; }
  return result;
}

function record(value: unknown) {
  const item = object(value);
  if (!item || !id(item.id, "rec") || !object(item.fields)) throw new NodeFailure("INVALID_RESPONSE", "Airtable returned an invalid record.", false);
  return { id: item.id, fields: redactValue(item.fields), createdTime: typeof item.createdTime === "string" ? item.createdTime : null };
}

function writeFields(input: unknown) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 50) throw new NodeFailure("INVALID_INPUT", "Add between 1 and 50 fields.", false);
  const fields: Record<string, unknown> = Object.create(null);
  for (const entry of input) {
    const row = object(entry);
    if (!row || typeof row.column !== "string" || !row.column.trim() || row.column.length > 256 || ["__proto__", "constructor", "prototype"].includes(row.column) || Object.hasOwn(fields, row.column)) throw new NodeFailure("INVALID_INPUT", "Choose distinct valid Airtable fields.", false);
    if (row.type === "text" && typeof row.value === "string") fields[row.column] = row.value;
    else if (row.type === "boolean" && (row.value === true || row.value === false || row.value === "true" || row.value === "false")) fields[row.column] = row.value === true || row.value === "true";
    else if (row.type === "null" && (row.value === "" || row.value === undefined || row.value === null)) fields[row.column] = null;
    else if (row.type === "number" && (typeof row.value === "number" || typeof row.value === "string" && /^-?(?:\d+\.?\d*|\.\d+)$/.test(row.value)) && Number.isFinite(Number(row.value)) && Math.abs(Number(row.value)) <= Number.MAX_SAFE_INTEGER && (typeof row.value !== "string" || preservesJsonDecimal(row.value, Number(row.value)))) fields[row.column] = Number(row.value);
    else if (row.type === "expression" && (typeof row.value === "string" || typeof row.value === "boolean" || typeof row.value === "number" && Number.isFinite(row.value) && Math.abs(row.value) <= Number.MAX_SAFE_INTEGER || row.value === null)) fields[row.column] = row.value;
    else throw new NodeFailure("INVALID_INPUT", "Enter a supported field value.", false);
  }
  if (Buffer.byteLength(JSON.stringify(fields)) > 200_000) throw new NodeFailure("INVALID_INPUT", "Airtable fields exceed the size limit.", false);
  return fields;
}

export async function executeAirtable(config: Record<string, unknown>, operation: Operation, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, read?: Transport, write?: Transport) {
  const issue = nodeConfigIssues(`action.airtable.${operation}`, config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_INPUT", issue.message, false);
  const fields = operation === "create-record" || operation === "update-record" ? writeFields(config.fields) : undefined;
  const sample = { id: operation === "create-record" ? "rec00000000000000" : config.recordId ?? "rec00000000000000", fields: fields ?? { Name: "Sample record" }, createdTime: null };
  if (mode === "mock") return { status: "succeeded" as const, route: "success" as const, output: operation === "list-records" ? { records: [sample], hasMore: false, nextCursor: null } : { record: sample } };
  const token = await credentials.airtableAccessToken(String(config.credentialId ?? ""), workspaceId);
  const query = new URLSearchParams();
  if (operation === "list-records") { query.set("pageSize", String(config.pageSize ?? 20)); if (config.cursor) query.set("offset", String(config.cursor)); }
  const path = `${config.baseId}/${config.tableId}${operation === "get-record" || operation === "update-record" ? `/${config.recordId}` : ""}${query.size ? `?${query}` : ""}`;
  const method = operation === "create-record" ? "POST" : operation === "update-record" ? "PATCH" : "GET";
  const payload = await request(token, path, method, fields ? { fields } : undefined, read, write);
  const root = object(payload);
  if (operation === "list-records") {
    if (!root || !Array.isArray(root.records) || root.records.length > Number(config.pageSize ?? 20) || root.offset !== undefined && (typeof root.offset !== "string" || root.offset.length > 1024 || /[\s\u0000-\u001f\u007f]/.test(root.offset))) throw new NodeFailure("INVALID_RESPONSE", "Airtable returned an invalid record list.", false);
    return { status: "succeeded" as const, route: "success" as const, output: { records: root.records.map(record), hasMore: Boolean(root.offset), nextCursor: root.offset ?? null } };
  }
  try { return { status: "succeeded" as const, route: "success" as const, output: { record: record(payload) } }; }
  catch (error) { if (method !== "GET") throw uncertainDelivery("Airtable"); throw error; }
}

export async function airtableResources(token: string, kind: "bases" | "tables" | "fields" | "trigger-fields" | "records", baseId?: string, tableId?: string, read?: Transport) {
  if (kind !== "bases" && !id(baseId, "app")) throw new NodeFailure("INVALID_INPUT", "Choose an Airtable base.", false);
  if ((kind === "fields" || kind === "trigger-fields" || kind === "records") && !id(tableId, "tbl")) throw new NodeFailure("INVALID_INPUT", "Choose an Airtable table.", false);
  const path = kind === "bases" ? "meta/bases" : kind === "records" ? `${baseId}/${tableId}?pageSize=100` : `meta/bases/${baseId}/tables`;
  const payload = object(await request(token, path, "GET", undefined, read));
  const items = kind === "fields" || kind === "trigger-fields" ? (Array.isArray(payload?.tables) ? object(payload.tables.find((entry) => object(entry)?.id === tableId))?.fields : undefined) : payload?.[kind];
  if (!Array.isArray(items) || items.length > 1000) throw new NodeFailure("INVALID_RESPONSE", "Airtable returned an invalid resource list.", false);
  const selected = kind === "trigger-fields" ? items.filter((entry) => ["createdTime", "lastModifiedTime"].includes(String(object(entry)?.type))) : items;
  return { items: selected.slice(0, 100).map((entry) => {
    const item = object(entry);
    const prefix = kind === "bases" ? "app" : kind === "tables" ? "tbl" : kind === "fields" || kind === "trigger-fields" ? "fld" : "rec";
    if (!item || !id(item.id, prefix)) throw new NodeFailure("INVALID_RESPONSE", "Airtable returned an invalid resource.", false);
    const label = kind === "records" ? Object.values(object(item.fields) ?? {}).find((value) => typeof value === "string" && value.trim()) : item.name;
    if (kind !== "records" && (typeof label !== "string" || label.length > 256)) throw new NodeFailure("INVALID_RESPONSE", "Airtable returned an invalid resource.", false);
    return { id: item.id, name: typeof label === "string" ? label.slice(0, 256) : item.id, ...(kind === "trigger-fields" ? { type: item.type as string } : {}) };
  }), truncated: selected.length > 100 || Boolean(payload?.offset) };
}

/** Read a complete bounded change window; callers commit its checkpoint atomically. */
export async function airtableTriggerChanges(token: string, baseId: string, tableId: string, fieldId: string, after: string, read?: Transport) {
  if (!id(baseId, "app") || !id(tableId, "tbl") || !id(fieldId, "fld") || !Number.isFinite(Date.parse(after))) throw new NodeFailure("INVALID_INPUT", "Choose a supported Airtable resource.", false);
  const pollRequest = async (path: string) => {
    try { return await request(token, path, "GET", undefined, read); }
    catch (error) {
      // Polling resumes at the normal interval, so a 429 never advances the cursor.
      if (error instanceof NodeFailure && error.statusCode === 429 && (error.retryAfterMs === undefined || Number.isFinite(error.retryAfterMs) && error.retryAfterMs <= 86_400_000)) throw new NodeFailure(error.code, error.message, true, 429, error.retryAfterMs);
      throw error;
    }
  };
  const metadata = object(await pollRequest(`meta/bases/${baseId}/tables`));
  const table = Array.isArray(metadata?.tables) ? object(metadata.tables.find((entry) => object(entry)?.id === tableId)) : undefined;
  const field = Array.isArray(table?.fields) ? object(table.fields.find((entry) => object(entry)?.id === fieldId)) : undefined;
  if (!field || typeof field.name !== "string" || !field.name.trim() || field.name.length > 256 || /[{}\\\x00-\x1f\x7f]/.test(field.name) || !["createdTime", "lastModifiedTime"].includes(String(field.type))) throw new NodeFailure("INVALID_INPUT", "Choose a supported Airtable resource.", false);
  const rows: Array<{ id: string; timestamp: string; item: Record<string, unknown> }> = [];
  const offsets = new Set<string>();
  let offset: string | undefined;
  for (let page = 0; page < 11; page++) {
    const query = new URLSearchParams({ pageSize: "100", filterByFormula: `IS_AFTER({${field.name}}, DATETIME_PARSE('${new Date(after).toISOString()}'))` });
    if (offset) query.set("offset", offset);
    const payload = object(await pollRequest(`${baseId}/${tableId}?${query}`));
    if (!payload || !Array.isArray(payload.records) || payload.records.length > 100) throw new NodeFailure("INVALID_RESPONSE", "Airtable returned an invalid record list.", false);
    for (const value of payload.records) {
      const parsed = record(value);
      const timestamp = object(value)?.fields && object(object(value)?.fields)?.[field.name];
      if (typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp)) || Date.parse(timestamp) > Date.now() + 60_000) throw new NodeFailure("INVALID_RESPONSE", "Airtable returned an invalid record list.", false);
      rows.push({ id: parsed.id as string, timestamp: new Date(timestamp).toISOString(), item: parsed });
      if (rows.length > 1000) throw new NodeFailure("PROVIDER_POLL_LIMIT", "Trigger history is full. Review the checkpoint before continuing.", false);
    }
    if (payload.offset === undefined) return { rows, event: field.type === "createdTime" ? "created" as const : "updated" as const };
    if (typeof payload.offset !== "string" || !payload.offset || payload.offset.length > 1024 || /[\s\x00-\x1f\x7f]/.test(payload.offset) || offsets.has(payload.offset)) throw new NodeFailure("INVALID_RESPONSE", "Airtable returned an invalid record list.", false);
    offset = payload.offset;
    offsets.add(offset);
  }
  throw new NodeFailure("PROVIDER_POLL_LIMIT", "Trigger history is full. Review the checkpoint before continuing.", false);
}
