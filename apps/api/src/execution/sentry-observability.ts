import { CredentialProvider } from "@prisma/client";
import { nodeConfigIssues } from "@workflow/contracts";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure } from "./node-failure";
import { getJson, observabilityTransport, record, token, type ObservabilityTransport } from "./observability-read";
import { assertNoCredentialInProviderFields } from "./provider-credential-safety";

const hosts: Record<string, string> = { global: "sentry.io", us: "us.sentry.io", de: "de.sentry.io" };
const slug = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,99}$/i.test(value);
const issueId = (value: unknown): value is string => typeof value === "string" && /^[0-9]{1,100}$/.test(value);
const statuses = new Set(["unresolved", "resolved", "ignored"]);
const levels = new Set(["fatal", "error", "warning", "info", "debug"]);
function date(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
}
function enumValue(value: unknown, allowed: Set<string>): string | null {
  return typeof value === "string" && allowed.has(value) ? value : null;
}
function normalizeIssue(value: unknown, accessToken: string) {
  const item = record(value);
  if (!item || !issueId(item.id)) return null;
  const status = enumValue(item.status, statuses);
  const level = enumValue(item.level, levels);
  const firstSeen = date(item.firstSeen);
  const lastSeen = date(item.lastSeen);
  const count = typeof item.count === "string" && /^[0-9]{1,30}$/.test(item.count) ? item.count : null;
  assertNoCredentialInProviderFields([item.id, status, level, firstSeen, lastSeen, count], accessToken);
  const partial = status === null || level === null || firstSeen === null || lastSeen === null || count === null;
  // Issue titles are user content; strip the current credential before bounding.
  const safeTitle = typeof item.title === "string" ? item.title.split(accessToken).join("[REDACTED]") : null;
  const titleTruncated = safeTitle !== null && safeTitle.length > 500;
  const title = safeTitle?.slice(0, 500) ?? null;
  return { id: item.id, title, titleTruncated, status, level, firstSeen, lastSeen, count, partial: partial || title === null || titleTruncated };
}
async function context(config: Record<string, unknown>, workspaceId: string, credentials: CredentialService) {
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Sentry connection.", false);
  const credential = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.SENTRY);
  const region = typeof credential.region === "string" ? credential.region : "global";
  const host = Object.hasOwn(hosts, region) ? hosts[region] : undefined;
  if (!host) throw new NodeFailure("CREDENTIAL_INVALID", "Sentry connection requires a supported region.", false);
  return { base: `https://${host}/api/0/organizations`, accessToken: token(credential, "Sentry") };
}

export async function executeSentryGetIssue(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: ObservabilityTransport = observabilityTransport) {
  if (!slug(config.organization) || !slug(config.project) || !issueId(config.issueId)) throw new NodeFailure("INVALID_INPUT", "Choose a Sentry organization, project and numeric issue ID.", false);
  const configIssue = nodeConfigIssues("action.sentry.get-issue", config, "resolved")[0];
  if (configIssue) throw new NodeFailure("INVALID_INPUT", configIssue.message, false);
  if (mode === "mock") return { status: "succeeded" as const, output: { issue: { id: config.issueId, title: "Example issue", titleTruncated: false, status: "unresolved", level: "error", firstSeen: null, lastSeen: null, count: "1", partial: true } }, route: "success" as const };
  const { base, accessToken } = await context(config, workspaceId, credentials);
  const result = await getJson(`${base}/${config.organization}/issues/${config.issueId}/?collapse=release&collapse=stats&collapse=tags`, accessToken, "Sentry", transport);
  const item = record(result.data);
  const project = record(item?.project);
  if (!project || project.slug !== config.project) throw new NodeFailure("INVALID_RESPONSE", "Sentry issue does not match the selected project.", false);
  const issue = normalizeIssue(item, accessToken);
  if (!issue || issue.id !== config.issueId) throw new NodeFailure("INVALID_RESPONSE", "Sentry returned an invalid issue.", false);
  return { status: "succeeded" as const, output: { issue }, route: "success" as const };
}
