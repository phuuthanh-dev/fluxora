import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { readBoundedProviderJson } from "./provider-json";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
const slugPattern = /^[a-z0-9][a-z0-9_-]{0,99}$/i;
const regions: Record<string, string> = { global: "sentry.io", us: "us.sentry.io", de: "de.sentry.io" };
function itemRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function text(value: unknown, max = 500) { return typeof value === "string" ? value.slice(0, max) : ""; }
function slug(value: unknown) { return typeof value === "string" && slugPattern.test(value) ? value : ""; }

async function sentryGet(path: string, credential: Record<string, unknown>, transport: Transport) {
  const token = typeof credential.token === "string" ? credential.token : "";
  const region = typeof credential.region === "string" ? credential.region : "global";
  const host = Object.hasOwn(regions, region) ? regions[region] : undefined;
  if (!/^[A-Za-z0-9._-]{1,512}$/.test(token) || !host) throw new NodeFailure("CREDENTIAL_INVALID", "Sentry connection requires a token and a supported region.", false);
  let response: Response;
  try { response = await transport(`https://${host}/api/0/${path}`, { method: "GET", headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal: AbortSignal.timeout(10_000) }); }
  catch (error) { throw nodeFailureFromOutboundPolicy(error); }
  if (!response.ok) throw new NodeFailure("HTTP_ERROR", `Sentry returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
  let data: unknown;
  try { data = await readBoundedProviderJson(response); }
  catch (error) { if (error instanceof NodeFailure) throw error; throw new NodeFailure("INVALID_RESPONSE", "Sentry returned an invalid response.", false); }
  if (!Array.isArray(data)) throw new NodeFailure("INVALID_RESPONSE", "Sentry returned an invalid response.", false);
  const hasMore = (response.headers.get("link") ?? "").split(",").some((link) => /rel="next"/.test(link) && /results="true"/.test(link));
  return { data, hasMore };
}

export async function listSentryOrganizations(credential: Record<string, unknown>, transport: Transport = fetchSafeOutbound) {
  const result = await sentryGet("organizations/?per_page=100", credential, transport);
  const options = result.data.flatMap((value: unknown) => {
    const item = itemRecord(value); const id = slug(item?.slug);
    return id ? [{ id, name: text(item?.name, 300) || id }] : [];
  });
  return { organizations: options.slice(0, 100), hasMore: result.hasMore || options.length > 100 };
}

export async function listSentryProjects(credential: Record<string, unknown>, organization: string, transport: Transport = fetchSafeOutbound) {
  if (!slug(organization)) throw new NodeFailure("INVALID_INPUT", "Choose a Sentry organization.", false);
  const result = await sentryGet(`organizations/${organization}/projects/?per_page=100`, credential, transport);
  const options = result.data.flatMap((value: unknown) => {
    const item = itemRecord(value); const id = slug(item?.slug);
    return id ? [{ id, name: text(item?.name, 300) || id }] : [];
  });
  return { projects: options.slice(0, 100), hasMore: result.hasMore || options.length > 100 };
}

export async function executeSentryListIssues(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutbound) {
  const organization = slug(config.organization);
  const project = slug(config.project);
  const status = config.status === undefined ? "unresolved" : config.status;
  const limit = config.limit === undefined ? 20 : config.limit;
  if (!organization || !project || !["unresolved", "resolved", "all"].includes(String(status)) || typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new NodeFailure("INVALID_INPUT", "Choose an organization, project and status, and a limit between 1 and 100.", false);
  if (mode === "mock") return { status: "succeeded" as const, output: { issues: [{ id: "123", shortId: "EXAMPLE-1", title: "Example issue", status: "unresolved", level: "error", firstSeen: "", lastSeen: "", count: "1" }], hasMore: false }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Sentry connection.", false);
  const credential = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.SENTRY);
  const params = new URLSearchParams({ project, query: status === "all" ? "" : `is:${status}`, limit: String(limit) });
  const result = await sentryGet(`organizations/${organization}/issues/?${params}`, credential, transport);
  const issues = result.data.slice(0, limit).flatMap((value: unknown) => {
    const issue = itemRecord(value); const id = text(issue?.id, 100);
    return id ? [{ id, shortId: text(issue?.shortId, 100), title: text(issue?.title), status: text(issue?.status, 50), level: text(issue?.level, 50), firstSeen: text(issue?.firstSeen, 100), lastSeen: text(issue?.lastSeen, 100), count: text(issue?.count, 50) }] : [];
  });
  return { status: "succeeded" as const, output: { issues, hasMore: result.hasMore || result.data.length > limit }, route: "success" as const };
}
