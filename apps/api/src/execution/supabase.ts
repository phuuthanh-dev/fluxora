import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { readBoundedProviderJson } from "./provider-json";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
const identifier = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;
function object(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }

async function get(path: string, credential: Record<string, unknown>, transport: Transport, openapi = false) {
  const projectRef = typeof credential.projectRef === "string" ? credential.projectRef : "";
  const apiKey = typeof credential.apiKey === "string" ? credential.apiKey : "";
  if (!/^[a-z0-9]{10,40}$/.test(projectRef) || !/^[A-Za-z0-9._-]{1,4096}$/.test(apiKey)) throw new NodeFailure("CREDENTIAL_INVALID", "Supabase connection requires a valid project reference and API key.", false);
  const headers: Record<string, string> = { apikey: apiKey, accept: openapi ? "application/openapi+json" : "application/json", "user-agent": "Fluxora/1.0" };
  // Legacy JWT API keys may be used as a bearer token. New sb_* keys are not JWTs.
  if (apiKey.startsWith("eyJ")) headers.authorization = `Bearer ${apiKey}`;
  let response: Response;
  try { response = await transport(`https://${projectRef}.supabase.co/rest/v1/${path}`, { method: "GET", headers, signal: AbortSignal.timeout(10_000) }); }
  catch (error) { throw nodeFailureFromOutboundPolicy(error); }
  if (!response.ok) throw new NodeFailure("HTTP_ERROR", `Supabase returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
  try { return await readBoundedProviderJson(response); }
  catch (error) { if (error instanceof NodeFailure) throw error; throw new NodeFailure("INVALID_RESPONSE", "Supabase returned an invalid response.", false); }
}

/** OpenAPI discovery may be unavailable for publishable keys; manual input remains available. */
export async function listSupabaseTables(credential: Record<string, unknown>, transport: Transport = fetchSafeOutbound) {
  const data = object(await get("", credential, transport, true));
  const paths = object(data?.paths);
  if (!paths) throw new NodeFailure("INVALID_RESPONSE", "Supabase did not return its table schema.", false);
  const tables = Object.entries(paths).flatMap(([path, value]) => {
    const name = path.startsWith("/") ? path.slice(1) : "";
    return identifier.test(name) && object(object(value)?.get) ? [{ id: name, name }] : [];
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { tables: tables.slice(0, 100), hasMore: tables.length > 100 };
}

export async function executeSupabaseSelect(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutbound) {
  const table = typeof config.table === "string" ? config.table : "";
  const limit = config.limit === undefined ? 20 : config.limit;
  if (!identifier.test(table) || typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new NodeFailure("INVALID_INPUT", "Choose a table and a limit between 1 and 100.", false);
  if (mode === "mock") return { status: "succeeded" as const, output: { rows: [{ example: true }], count: 1 }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Supabase connection.", false);
  const credential = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.SUPABASE);
  const params = new URLSearchParams({ select: "*", limit: String(limit) });
  const result = await get(`${encodeURIComponent(table)}?${params}`, credential, transport);
  if (!Array.isArray(result)) throw new NodeFailure("INVALID_RESPONSE", "Supabase returned an invalid row list.", false);
  const rows = result.slice(0, limit);
  if (Buffer.byteLength(JSON.stringify(rows)) > 200_000) throw new NodeFailure("RESPONSE_TOO_LARGE", "Supabase rows exceed the output size limit.", false);
  return { status: "succeeded" as const, output: { rows, count: rows.length }, route: "success" as const };
}
