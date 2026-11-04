import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { requireResolvedSelection, requireSafeSelectionNumber } from "./relational-selection-validation";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { readBoundedProviderJson } from "./provider-json";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
const identifier = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;
function object(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }

// Only simple identifiers and scalar comparisons are supported. In particular,
// do not accept PostgREST select expressions, logical trees, or raw operators.
const filterOperators: Record<string, string> = {
  equals: "eq", notEquals: "neq", greaterThan: "gt", greaterThanOrEqual: "gte",
  lessThan: "lt", lessThanOrEqual: "lte", isNull: "is", isNotNull: "not.is",
};
const reservedFilterNames = new Set(["select", "order", "limit", "offset", "and", "or", "not", "columns", "on_conflict"]);
const selectConfigKeys = new Set(["credentialId", "table", "limit", "columns", "filters", "order", "offset", "retryAttempts", "timeoutMs"]);

function selectParams(config: Record<string, unknown>, limit: number) {
  const invalid = (): never => { throw new NodeFailure("INVALID_INPUT", "Invalid Supabase selection, filters, ordering or offset.", false); };
  const column = (value: unknown): string => typeof value === "string" && identifier.test(value) ? value : invalid();
  const columns = Object.hasOwn(config, "columns") ? config.columns : [];
  const filters = Object.hasOwn(config, "filters") ? config.filters : [];
  const order = Object.hasOwn(config, "order") ? config.order : [];
  const offset = Object.hasOwn(config, "offset") ? config.offset : 0;
  if (!Array.isArray(columns) || columns.length > 50 || !Array.isArray(filters) || filters.length > 20 || !Array.isArray(order) || order.length > 10 || typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > 1_000_000) return invalid();
  if (offset > 0 && order.length === 0) throw new NodeFailure("INVALID_INPUT", "Supabase offset pagination requires an explicit order.", false);

  const params = new URLSearchParams({ select: columns.length ? columns.map(column).join(",") : "*", limit: String(limit) });
  for (const filter of filters) {
    const item = object(filter);
    if (!item || Object.keys(item).some((key) => !["column", "operator", "value"].includes(key))) invalid();
    const name = column(item!.column);
    if (reservedFilterNames.has(name) || typeof item!.operator !== "string" || !Object.hasOwn(filterOperators, item!.operator)) invalid();
    const operator = item!.operator as string;
    const nullCheck = operator === "isNull" || operator === "isNotNull";
    let value: string;
    if (nullCheck) {
      if (Object.hasOwn(item!, "value")) invalid();
      value = "null";
    } else {
      const scalar = item!.value;
      if ((typeof scalar !== "string" && typeof scalar !== "number" && typeof scalar !== "boolean") || (typeof scalar === "number" && !Number.isFinite(scalar)) || (typeof scalar === "string" && (Buffer.byteLength(scalar) > 1_000 || /[\u0000-\u001f\u007f]/.test(scalar)))) invalid();
      requireSafeSelectionNumber(scalar);
      value = String(scalar);
    }
    params.append(name, `${filterOperators[operator]}.${value}`);
  }
  if (order.length) {
    params.set("order", order.map((entry) => {
      const item = object(entry);
      if (!item || Object.keys(item).some((key) => !["column", "direction", "nulls"].includes(key))) invalid();
      const name = column(item!.column);
      if (item!.direction !== "asc" && item!.direction !== "desc") invalid();
      if (item!.nulls !== undefined && item!.nulls !== "first" && item!.nulls !== "last") invalid();
      return `${name}.${item!.direction}${item!.nulls === undefined ? "" : `.nulls${item!.nulls}`}`;
    }).join(","));
  }
  if (config.offset !== undefined) params.set("offset", String(offset));
  if (params.toString().length > 8_000) invalid();
  return params;
}

async function get(path: string, credential: Record<string, unknown>, transport: Transport, openapi = false) {
  const projectRef = typeof credential.projectRef === "string" ? credential.projectRef : "";
  const apiKey = typeof credential.apiKey === "string" ? credential.apiKey : "";
  if (!/^[a-z0-9]{10,40}$/.test(projectRef) || !/^[A-Za-z0-9._-]{1,4096}$/.test(apiKey)) throw new NodeFailure("CREDENTIAL_INVALID", "Supabase connection requires a valid project reference and API key.", false);
  const accessToken = credential.userAccessToken;
  if (accessToken !== undefined && accessToken !== "" && (typeof accessToken !== "string" || accessToken.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken))) {
    throw new NodeFailure("CREDENTIAL_INVALID", "Supabase user access token must be a compact signed JWT.", false);
  }
  const headers: Record<string, string> = { apikey: apiKey, accept: openapi ? "application/openapi+json" : "application/json", "user-agent": "Fluxora/1.0" };
  // A publishable/anon key without a user JWT generally uses anonymous access;
  // an explicit JWT supplies the bearer identity and overrides a legacy JWT
  // key. Supabase validates identity and policies. Secret/service-role keys or
  // privileged JWT roles may bypass RLS; a token's shape proves no identity.
  if (typeof accessToken === "string" && accessToken) headers.authorization = `Bearer ${accessToken}`;
  else if (apiKey.startsWith("eyJ")) headers.authorization = `Bearer ${apiKey}`;
  let response: Response;
  try { response = await transport(`https://${projectRef}.supabase.co/rest/v1/${path}`, { method: "GET", headers, signal: AbortSignal.timeout(10_000) }); }
  catch (error) { throw nodeFailureFromOutboundPolicy(error); }
  if (!response.ok) {
    // Schema discovery may be denied for anon/publishable keys even when the
    // same key can read rows under RLS. Never surface raw provider messages.
    if (openapi && response.status === 401) {
      try {
        const body = object(await readBoundedProviderJson(response));
        if (body?.message === "Access to schema is forbidden") throw new NodeFailure("SUPABASE_DISCOVERY_RESTRICTED", "Supabase denied schema discovery.", false, 403);
      } catch (error) { if (error instanceof NodeFailure && error.code === "SUPABASE_DISCOVERY_RESTRICTED") throw error; }
    }
    const guidance = response.status === 401 ? " Check the API key and any user access token." : response.status === 403 ? " Check the permissions of the effective key or token role." : "";
    throw new NodeFailure("HTTP_ERROR", `Supabase returned ${response.status}.${guidance}`, response.status === 429 || response.status >= 500, response.status);
  }
  try { return await readBoundedProviderJson(response); }
  catch (error) { if (error instanceof NodeFailure) throw error; throw new NodeFailure("INVALID_RESPONSE", "Supabase returned an invalid response.", false); }
}

async function getManagedSchema(credential: Record<string, unknown>, transport: Transport) {
  const projectRef = typeof credential.projectRef === "string" ? credential.projectRef : "";
  const managementToken = typeof credential.managementToken === "string" ? credential.managementToken : "";
  if (!/^[a-z0-9]{10,40}$/.test(projectRef) || !/^[A-Za-z0-9._-]{1,4096}$/.test(managementToken)) {
    throw new NodeFailure("CREDENTIAL_INVALID", "Supabase connection requires a valid project reference and management token.", false);
  }
  let response: Response;
  try {
    response = await transport(`https://api.supabase.com/v1/projects/${projectRef}/database/openapi?schema=public`, {
      method: "GET", headers: { authorization: `Bearer ${managementToken}`, accept: "application/json", "user-agent": "Fluxora/1.0" }, signal: AbortSignal.timeout(10_000),
    });
  } catch (error) { throw nodeFailureFromOutboundPolicy(error); }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new NodeFailure("SUPABASE_MANAGEMENT_AUTH_FAILED", "Supabase denied management API access.", false, response.status);
    throw new NodeFailure("HTTP_ERROR", `Supabase management API returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
  }
  try { return await readBoundedProviderJson(response); }
  catch (error) { if (error instanceof NodeFailure) throw error; throw new NodeFailure("INVALID_RESPONSE", "Supabase returned an invalid schema response.", false); }
}

/** OpenAPI discovery may be unavailable for publishable keys; manual input remains available. */
export async function listSupabaseTables(credential: Record<string, unknown>, transport: Transport = fetchSafeOutbound) {
  const data = object(await (credential.managementToken ? getManagedSchema(credential, transport) : get("", credential, transport, true)));
  const paths = object(data?.paths);
  if (!paths) throw new NodeFailure("INVALID_RESPONSE", "Supabase did not return its table schema.", false);
  const tables = Object.entries(paths).flatMap(([path, value]) => {
    const name = path.startsWith("/") ? path.slice(1) : "";
    return identifier.test(name) && object(object(value)?.get) ? [{ id: name, name }] : [];
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { tables: tables.slice(0, 100), hasMore: tables.length > 100 };
}

const columnTypeLabels = new Set([
  "string", "integer", "number", "boolean", "array", "object",
  "smallint", "bigint", "numeric", "decimal", "real", "double precision", "text", "character varying", "character",
  "uuid", "date", "time", "time without time zone", "time with time zone", "timestamp", "timestamp without time zone", "timestamp with time zone",
  "json", "jsonb", "bytea", "interval", "int2", "int4", "int8", "float4", "float8", "varchar", "bool", "timestamptz", "timetz",
]);

/**
 * Caller must authorize the workspace and load its credential before calling.
 * Metadata reflects only the returned schema, not row or column read permission.
 * An absent/incomplete table definition is partial; provider errors propagate so
 * callers can offer manual entry without claiming that the table has no columns.
 */
export async function listSupabaseColumns(credential: Record<string, unknown>, table: string, transport: Transport = fetchSafeOutbound) {
  if (typeof table !== "string" || !identifier.test(table)) throw new NodeFailure("INVALID_INPUT", "Choose a valid Supabase table.", false);
  const data = object(await (credential.managementToken ? getManagedSchema(credential, transport) : get("", credential, transport, true)));
  const paths = object(data?.paths);
  const definitions = object(data?.definitions);
  const path = paths && Object.hasOwn(paths, `/${table}`) ? object(paths[`/${table}`]) : undefined;
  const definition = definitions && Object.hasOwn(definitions, table) ? object(definitions[table]) : undefined;
  const properties = object(definition?.properties);
  if (!object(path?.get) || !properties) return { columns: [] as Array<{ name: string; type: string | null }>, partial: true };

  let partial = false;
  const columns: Array<{ name: string; type: string | null }> = [];
  for (const [name, value] of Object.entries(properties)) {
    const property = object(value);
    if (!identifier.test(name) || !property) { partial = true; continue; }
    const format = typeof property.format === "string" && columnTypeLabels.has(property.format) ? property.format : undefined;
    const type = typeof property.type === "string" && columnTypeLabels.has(property.type) ? property.type : undefined;
    const label = format ?? type ?? null;
    if (label === null) partial = true;
    columns.push({ name, type: label });
  }
  columns.sort((a, b) => a.name.localeCompare(b.name));
  if (columns.length > 50) partial = true;
  return { columns: columns.slice(0, 50), partial };
}

export async function executeSupabaseSelect(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutbound, nodeVersion: number = 1): Promise<{ status: "succeeded"; output: { rows: unknown[]; count: number; returnedCount?: number; page?: { limit: number; offset: number; completeness: "unknown" } }; route: "success" }> {
  if (nodeVersion !== 1 && nodeVersion !== 2) throw new NodeFailure("INVALID_CONFIGURATION", "Supabase node version is not supported.", false);
  if (nodeVersion === 1) {
    const table = typeof config.table === "string" ? config.table : "";
    const limit = config.limit === undefined ? 20 : config.limit;
    if (!identifier.test(table) || typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new NodeFailure("INVALID_INPUT", "Choose a table and a limit between 1 and 100.", false);
    if (mode === "mock") return { status: "succeeded" as const, output: { rows: [{ example: true }], count: 1 }, route: "success" as const };
    const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
    if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Supabase connection.", false);
    const credential = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.SUPABASE);
    // Historical reads ignored userAccessToken, including any pre-existing extra credential property.
    const params = new URLSearchParams({ select: "*", limit: String(limit) });
    const result = await get(`${encodeURIComponent(table)}?${params}`, { projectRef: credential.projectRef, apiKey: credential.apiKey }, transport);
    if (!Array.isArray(result)) throw new NodeFailure("INVALID_RESPONSE", "Supabase returned an invalid row list.", false);
    const rows = result.slice(0, limit);
    if (Buffer.byteLength(JSON.stringify(rows)) > 200_000) throw new NodeFailure("RESPONSE_TOO_LARGE", "Supabase rows exceed the output size limit.", false);
    return { status: "succeeded" as const, output: { rows, count: rows.length }, route: "success" as const };
  }
  if (Object.keys(config).some((key) => !selectConfigKeys.has(key))) throw new NodeFailure("INVALID_INPUT", "Supabase configuration contains an unsupported field.", false);
  requireResolvedSelection(config, ["limit", "columns", "filters", "order", "offset"], "Supabase");
  const table = typeof config.table === "string" ? config.table : "";
  const limit = Object.hasOwn(config, "limit") ? config.limit : 20;
  if (!identifier.test(table) || typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new NodeFailure("INVALID_INPUT", "Choose a table and a limit between 1 and 100.", false);
  const params = selectParams(config, limit);
  // The provider may impose a smaller row cap. A short or full page does not
  // establish whether more rows exist, so completeness remains unknown.
  const output = (rows: unknown[]) => ({ rows, count: rows.length, returnedCount: rows.length, page: { limit, offset: typeof config.offset === "number" ? config.offset : 0, completeness: "unknown" as const } });
  if (mode === "mock") return { status: "succeeded" as const, output: output([{ example: true }]), route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Supabase connection.", false);
  const credential = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.SUPABASE);
  const result = await get(`${encodeURIComponent(table)}?${params}`, credential, transport);
  if (!Array.isArray(result)) throw new NodeFailure("INVALID_RESPONSE", "Supabase returned an invalid row list.", false);
  const rows = result.slice(0, limit);
  if (Buffer.byteLength(JSON.stringify(rows)) > 200_000) throw new NodeFailure("RESPONSE_TOO_LARGE", "Supabase rows exceed the output size limit.", false);
  return { status: "succeeded" as const, output: output(rows), route: "success" as const };
}
