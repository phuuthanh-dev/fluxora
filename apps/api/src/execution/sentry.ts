import { CredentialProvider } from "@prisma/client";
import { nodeConfigIssues } from "@workflow/contracts";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { readBoundedProviderJson } from "./provider-json";
import { observabilityTransport } from "./observability-read";
import { sentryCursorValid, sentryNextLink } from "./sentry-pagination";
import { assertNoCredentialInProviderFields } from "./provider-credential-safety";

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
  const url = `https://${host}/api/0/${path}`;
  let response: Response;
  try { response = await transport(url, { method: "GET", redirect: "manual", headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal: AbortSignal.timeout(10_000) }); }
  catch (error) { throw nodeFailureFromOutboundPolicy(error); }
  if (!response.ok) throw new NodeFailure("HTTP_ERROR", `Sentry returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
  let data: unknown;
  try { data = await readBoundedProviderJson(response); }
  catch (error) { if (error instanceof NodeFailure) throw error; throw new NodeFailure("INVALID_RESPONSE", "Sentry returned an invalid response.", false); }
  if (!Array.isArray(data)) throw new NodeFailure("INVALID_RESPONSE", "Sentry returned an invalid response.", false);
  const hasMore = (response.headers.get("link") ?? "").split(",").some((link) => /rel="next"/.test(link) && /results="true"/.test(link));
  return { data, hasMore, link: response.headers.get("link"), url };
}

export async function listSentryOrganizations(credential: Record<string, unknown>, transport: Transport = fetchSafeOutbound) {
  const result = await sentryGet("organizations/?per_page=100", credential, transport);
  const accessToken = typeof credential.token === "string" ? credential.token : "";
  const options = result.data.flatMap((value: unknown) => {
    const item = itemRecord(value); const id = slug(item?.slug);
    if (id) assertNoCredentialInProviderFields([id, item?.name], accessToken);
    return id ? [{ id, name: text(item?.name, 300) || id }] : [];
  });
  return { organizations: options.slice(0, 100), hasMore: result.hasMore || options.length > 100 };
}

export async function listSentryProjects(credential: Record<string, unknown>, organization: string, transport: Transport = fetchSafeOutbound) {
  if (!slug(organization)) throw new NodeFailure("INVALID_INPUT", "Choose a Sentry organization.", false);
  const result = await sentryGet(`organizations/${organization}/projects/?per_page=100`, credential, transport);
  const accessToken = typeof credential.token === "string" ? credential.token : "";
  const options = result.data.flatMap((value: unknown) => {
    const item = itemRecord(value); const id = slug(item?.slug);
    if (id) assertNoCredentialInProviderFields([id, item?.name], accessToken);
    return id ? [{ id, name: text(item?.name, 300) || id }] : [];
  });
  return { projects: options.slice(0, 100), hasMore: result.hasMore || options.length > 100 };
}

export async function listSentryInstallations(credential: Record<string, unknown>, organization: string, transport: Transport = fetchSafeOutbound) {
  if (!slug(organization)) throw new NodeFailure("INVALID_INPUT", "Choose a Sentry organization.", false);
  const result = await sentryGet(`organizations/${organization}/sentry-app-installations/?per_page=100`, credential, transport);
  const accessToken = typeof credential.token === "string" ? credential.token : "";
  const installations = result.data.flatMap((value: unknown) => {
    const item = itemRecord(value), app = itemRecord(item?.app), org = itemRecord(item?.organization);
    const id = typeof item?.uuid === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(item.uuid) ? item.uuid.toLowerCase() : "";
    const name = slug(app?.slug);
    if (!id || !name || item?.status !== "installed" || slug(org?.slug).toLowerCase() !== organization.toLowerCase() || (accessToken && (id.includes(accessToken) || name.includes(accessToken)))) return [];
    return [{ id, name }];
  });
  return { installations: installations.slice(0, 100), hasMore: result.hasMore || installations.length > 100 };
}

type SentryIssuesOutput = { issues: Array<{ id: string; shortId: string; title: string; status: string; level: string; firstSeen: string; lastSeen: string; count: string }>; hasMore: boolean; nextCursor?: string | null; partial?: boolean; partialReasons?: string[] };
export async function executeSentryListIssues(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: Transport | undefined = undefined): Promise<{ status: "succeeded"; output: SentryIssuesOutput; route: "success" }> {
  const issue = nodeConfigIssues("action.sentry.list-issues", config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_INPUT", issue.message, false);
  if (((Object.hasOwn(config, "cursor") && (config.cursor === undefined || config.cursor === null)) || (Object.hasOwn(config, "limit") && config.limit === undefined) || (Object.hasOwn(config, "status") && config.status === undefined))) {
    throw new NodeFailure("INVALID_INPUT", "Sentry filters or pagination could not be resolved.", false);
  }
  const organization = slug(config.organization);
  const project = slug(config.project);
  const status = config.status === undefined ? "unresolved" : config.status;
  const limit = config.limit === undefined ? 20 : config.limit;
  const cursor = config.cursor === undefined || config.cursor === null || config.cursor === "" ? null : config.cursor;
  if (!organization || !project || !["unresolved", "resolved", "all"].includes(String(status)) || typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100 || (cursor !== null && !sentryCursorValid(cursor))) throw new NodeFailure("INVALID_INPUT", "Choose an organization, project and status, a limit between 1 and 100, and a valid cursor.", false);
  if (mode === "mock") {
    const output = { issues: [{ id: "123", shortId: "EXAMPLE-1", title: "Example issue", status: "unresolved", level: "error", firstSeen: "", lastSeen: "", count: "1" }], hasMore: false };
    return { status: "succeeded", output: { ...output, nextCursor: null, partial: false, partialReasons: [] }, route: "success" };
  }
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Sentry connection.", false);
  const credential = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.SENTRY);
  const params = new URLSearchParams({ project, query: status === "all" ? "" : `is:${status}`, limit: String(limit) });
  if (cursor !== null) params.set("cursor", cursor);
  const result = await sentryGet(`organizations/${organization}/issues/?${params}`, credential, transport ?? observabilityTransport);
  const accessToken = typeof credential.token === "string" ? credential.token : "";
  const issues = result.data.slice(0, limit).flatMap((value: unknown) => {
    const issue = itemRecord(value); const id = text(issue?.id, 100);
    if (id) assertNoCredentialInProviderFields([issue?.id, issue?.shortId, issue?.title, issue?.status, issue?.level, issue?.firstSeen, issue?.lastSeen, issue?.count], accessToken);
    return id ? [{ id, shortId: text(issue?.shortId, 100), title: text(issue?.title), status: text(issue?.status, 50), level: text(issue?.level, 50), firstSeen: text(issue?.firstSeen, 100), lastSeen: text(issue?.lastSeen, 100), count: text(issue?.count, 50) }] : [];
  });
  const page = sentryNextLink(result.link, result.url);
  assertNoCredentialInProviderFields([page.cursor], accessToken);
  const reasons: string[] = [];
  if (issues.length < Math.min(result.data.length, limit)) reasons.push("invalid_items_omitted");
  if (result.data.length > limit) reasons.push("provider_page_exceeded_limit");
  if (page.hasMore === null) reasons.push("continuation_unknown");
  return { status: "succeeded" as const, output: { issues, hasMore: result.hasMore || result.data.length > limit, nextCursor: result.data.length > limit ? null : page.cursor, partial: reasons.length > 0, partialReasons: reasons }, route: "success" as const };
}
