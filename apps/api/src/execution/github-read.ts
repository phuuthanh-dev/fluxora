import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { readProviderJson, requireProviderSuccess } from "./provider-request-policy";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
type Kind = "issue" | "pull_request";
type Mode = "mock" | "live";
const maxPage = 1000;
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

function inputError(message: string): never { throw new NodeFailure("INVALID_CONFIGURATION", message, false); }
function invalidResponse(): never { throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "GitHub returned an invalid response.", false); }
function positiveInteger(value: unknown, defaultValue: number | undefined, maximum: number, label: string): number {
  if (value === undefined && defaultValue !== undefined) return defaultValue;
  const text = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) > maximum) return inputError(`GitHub ${label} must be an integer between 1 and ${maximum}.`);
  return Number(text);
}
function repositoryInput(value: unknown): string {
  const repository = typeof value === "string" ? value.trim() : "";
  const parts = repository.split("/");
  if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_.-]{1,100}$/.test(part) || part === "." || part === "..")) return inputError("GitHub repository must use the owner/repository format.");
  return repository;
}
function stateInput(value: unknown): "open" | "closed" | "all" {
  if (value === undefined) return "open";
  if (value === "open" || value === "closed" || value === "all") return value;
  return inputError("GitHub state must be open, closed, or all.");
}
function apiUrl(repository: string, kind: Kind, number?: number): URL {
  const [owner, repo] = repository.split("/") as [string, string];
  const path = kind === "issue" ? "issues" : "pulls";
  return new URL(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${path}${number === undefined ? "" : `/${number}`}`);
}
function normalize(value: unknown, repository: string, kind: Kind, credentialToken?: string) {
  const item = record(value);
  if (!item || typeof item.number !== "number" || !Number.isSafeInteger(item.number) || item.number < 1 || typeof item.title !== "string" || (item.state !== "open" && item.state !== "closed")) return invalidResponse();
  if (kind === "issue" && item.pull_request !== undefined) return invalidResponse();
  const path = kind === "issue" ? "issues" : "pull";
  const expected = `/${repository}/${path}/${item.number}`.toLowerCase();
  let url: URL;
  try { url = new URL(typeof item.html_url === "string" ? item.html_url : ""); } catch { return invalidResponse(); }
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password || url.pathname.toLowerCase() !== expected || url.search || url.hash) return invalidResponse();
  const user = record(item.user);
  const redact = (v: string) => credentialToken ? v.split(credentialToken).join("[REDACTED]") : v;
  const text = (v: unknown, limit: number) => typeof v === "string" ? redact(v).slice(0, limit) : null;
  return {
    number: item.number, title: redact(item.title).slice(0, 1000), state: item.state,
    url: `https://github.com/${repository}/${path}/${item.number}`,
    body: text(item.body, 65536), bodyTruncated: typeof item.body === "string" && redact(item.body).length > 65536, author: text(user?.login, 100),
    createdAt: text(item.created_at, 64), updatedAt: text(item.updated_at, 64), closedAt: text(item.closed_at, 64),
    ...(kind === "pull_request" ? { draft: item.draft === true, mergedAt: text(item.merged_at, 64), headSha: text(record(item.head)?.sha, 100), baseRef: text(record(item.base)?.ref, 255), headRef: text(record(item.head)?.ref, 255) } : {}),
  };
}

/** Only accept a continuation for the exact same query and the immediately following page. Never fetch a provider-supplied URL. */
function nextPageFromLink(link: string | null, requested: URL, page: number): number | null {
  if (!link) return null;
  const next = link.split(",").filter((part) => /;\s*rel\s*=\s*"?next"?(?:\s*;|\s*$)/i.test(part));
  if (!next.length) return null;
  if (next.length !== 1) return invalidResponse();
  const match = next[0]!.match(/^\s*<([^>]+)>/);
  let url: URL;
  try { url = new URL(match?.[1] ?? ""); } catch { return invalidResponse(); }
  if (url.origin !== requested.origin || url.username || url.password || url.pathname !== requested.pathname || url.hash) return invalidResponse();
  const expected = new URLSearchParams(requested.search);
  expected.set("page", String(page + 1));
  if ([...url.searchParams.keys()].length !== [...expected.keys()].length || [...expected.keys()].some((key) => url.searchParams.getAll(key).length !== 1 || url.searchParams.get(key) !== expected.get(key))) return invalidResponse();
  return page + 1;
}

async function execute(config: Record<string, unknown>, mode: Mode, workspaceId: string, credentials: CredentialService, kind: Kind, list: boolean, transport: Transport) {
  const repository = repositoryInput(config.repository);
  const page = list ? positiveInteger(config.page, 1, maxPage, "page") : undefined;
  const pageSize = list ? positiveInteger(config.pageSize, 30, 100, "page size") : undefined;
  const state = list ? stateInput(config.state) : undefined;
  const number = list ? undefined : positiveInteger(kind === "issue" ? config.issueNumber : config.pullRequestNumber, undefined, Number.MAX_SAFE_INTEGER, kind === "issue" ? "issue number" : "pull request number");
  const url = apiUrl(repository, kind, number);
  if (list) url.search = new URLSearchParams({ state: state!, per_page: String(pageSize), page: String(page) }).toString();
  const example = { number: number ?? 1, title: kind === "issue" ? "Example issue" : "Example pull request", state: "open", html_url: `https://github.com/${repository}/${kind === "issue" ? "issues" : "pull"}/${number ?? 1}`, body: "Example description", user: { login: "example" }, ...(kind === "pull_request" ? { head: { sha: "a".repeat(40), ref: "feature" }, base: { ref: "main" } } : {}) };
  if (mode === "mock") {
    const item = normalize(example, repository, kind);
    return { status: "succeeded" as const, output: list ? { repository, items: [item], page, pageSize, state, hasMore: false, nextPage: null, truncated: false } : { repository, item }, route: "success" as const };
  }
  const credentialId = typeof config.credentialId === "string" ? config.credentialId.trim() : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a GitHub connection.", false);
  const credential = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.GITHUB);
  const token = typeof credential.token === "string" ? credential.token.trim() : "";
  if (!token || token.length > 4096 || /[^\x21-\x7e]/.test(token)) throw new NodeFailure("CREDENTIAL_INVALID", "GitHub credential is missing a valid token.", false);
  let response: Response;
  try {
    response = await transport(url.toString(), { method: "GET", headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Fluxora" }, signal: AbortSignal.timeout(15_000) });
  } catch (error) { throw nodeFailureFromOutboundPolicy(error); }
  await requireProviderSuccess(response, "GitHub", false);
  const payload = await readProviderJson(response, "GitHub");
  if (!list) {
    const item = normalize(payload, repository, kind, token);
    if (item.number !== number) return invalidResponse();
    return { status: "succeeded" as const, output: { repository, item }, route: "success" as const };
  }
  if (!Array.isArray(payload) || payload.length > pageSize!) return invalidResponse();
  // GitHub's issues endpoint also includes pull requests; do not silently treat them as issues.
  const items = payload.filter((value) => !(kind === "issue" && record(value)?.pull_request !== undefined)).map((value) => normalize(value, repository, kind, token));
  const continuation = nextPageFromLink(response.headers.get("link"), url, page!);
  return { status: "succeeded" as const, output: { repository, items, page, pageSize, state, hasMore: continuation !== null, nextPage: continuation !== null && page! < maxPage ? continuation : null, truncated: continuation !== null && page === maxPage }, route: "success" as const };
}

export const executeGitHubListIssues = (config: Record<string, unknown>, mode: Mode, workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutbound) => execute(config, mode, workspaceId, credentials, "issue", true, transport);
export const executeGitHubGetIssue = (config: Record<string, unknown>, mode: Mode, workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutbound) => execute(config, mode, workspaceId, credentials, "issue", false, transport);
export const executeGitHubListPullRequests = (config: Record<string, unknown>, mode: Mode, workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutbound) => execute(config, mode, workspaceId, credentials, "pull_request", true, transport);
export const executeGitHubGetPullRequest = (config: Record<string, unknown>, mode: Mode, workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutbound) => execute(config, mode, workspaceId, credentials, "pull_request", false, transport);
