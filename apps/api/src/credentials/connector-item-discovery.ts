import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "./credential.service";
import { NodeFailure } from "../execution/node-failure";
import { fetchSafeOutbound } from "../execution/outbound-url-policy";
import { readProviderJson } from "../execution/provider-request-policy";
import { assertNoCredentialInProviderFields } from "../execution/provider-credential-safety";
import { executeSentryListIssues } from "../execution/sentry";
import { executeVercelListDeployments } from "../execution/vercel";
import { listGitLabResources } from "../execution/gitlab";
import { jiraPickerJql, searchJiraIssues } from "../execution/jira";

export type ItemResource = "jira-issue" | "gitlab-pipeline" | "gitlab-merge-request" | "github-label" | "sentry-issue" | "vercel-deployment";
export type ItemOptionPage = { items: Array<{ id: string; name: string }>; nextCursor: string | null; warning?: string };
type Transport = (url: string, init: RequestInit) => Promise<Response>;
type Options = { parent?: string; context?: string; query?: string; cursor?: string };

/** Fixed provider routes, owner authorization in the controller, minimal labels only. */
export async function discoverConnectorItems(resource: ItemResource, credentialId: string, workspaceId: string, options: Options, credentials: CredentialService, read: Transport = fetchSafeOutbound): Promise<ItemOptionPage> {
  const { parent = "", context = "", query = "", cursor = "" } = options;
  if (query.length > 200 || cursor.length > 2048 || /[\u0000-\u001f]/.test(query + cursor)) throw new NodeFailure("INVALID_INPUT", "Use a valid resource search and continuation.", false);
  if (resource === "jira-issue") {
    const result = await searchJiraIssues(credentialId, workspaceId, credentials, jiraPickerJql(query), cursor, 25, read);
    return { items: result.items.map((item) => ({ id: item.key, name: `${item.key} · ${item.summary}` })), nextCursor: result.nextCursor };
  }
  if (resource === "gitlab-pipeline" || resource === "gitlab-merge-request") {
    if (cursor && !/^[1-9]\d{0,4}$/.test(cursor)) throw new NodeFailure("INVALID_INPUT", "Use a valid GitLab page.", false);
    const data = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.GITLAB);
    const result = await listGitLabResources(String(data.token ?? ""), parent, resource === "gitlab-pipeline" ? "pipelines" : "merge_requests", cursor ? Number(cursor) : 1, read);
    return { items: result.items, nextCursor: result.nextPage ? String(result.nextPage) : null };
  }
  if (resource === "github-label") {
    if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(parent) || parent.length > 200 || parent.split("/").some((part) => part === "." || part === "..") || (cursor && !/^[1-9]\d{0,3}$/.test(cursor))) throw new NodeFailure("INVALID_INPUT", "Choose a repository and valid page.", false);
    const data = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.GITHUB);
    const token = typeof data.token === "string" ? data.token.trim() : "";
    if (!token || token.length > 4096 || /[^\x21-\x7e]/.test(token)) throw new NodeFailure("CREDENTIAL_INVALID", "Reconnect GitHub.", false);
    const page = cursor ? Number(cursor) : 1;
    const response = await read(`https://api.github.com/repos/${parent.split("/").map(encodeURIComponent).join("/")}/labels?per_page=50&page=${page}`, { method: "GET", headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Fluxora" }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) { await response.body?.cancel(); throw new NodeFailure("HTTP_ERROR", `GitHub returned ${response.status}.`, false, response.status); }
    const payload = await readProviderJson(response, "GitHub", false);
    if (!Array.isArray(payload) || payload.length > 50) throw new NodeFailure("INVALID_RESPONSE", "GitHub returned invalid labels.", false);
    const items = payload.map((entry: unknown) => {
      const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      if (typeof item.name !== "string" || !item.name.trim() || item.name.length > 50 || /[\u0000-\u001f\u007f]/.test(item.name)) throw new NodeFailure("INVALID_RESPONSE", "GitHub returned an invalid label.", false);
      assertNoCredentialInProviderFields([item.name], token);
      return { id: item.name, name: item.name };
    });
    const next = (response.headers.get("link") ?? "").split(",").some((v) => /rel="next"/.test(v));
    return { items, nextCursor: next && page < 9999 ? String(page + 1) : null };
  }
  if (resource === "sentry-issue") {
    const result = await executeSentryListIssues({ credentialId, organization: context, project: parent, status: "all", limit: 25, ...(cursor ? { cursor } : {}) }, "live", workspaceId, credentials, read);
    return { items: result.output.issues.filter((item) => /^\d+$/.test(item.id)).map((item) => ({ id: item.id, name: `${item.shortId || item.id} · ${item.title}` })), nextCursor: result.output.nextCursor ?? null, ...(result.output.partial ? { warning: "Some Sentry results or continuation may be unavailable." } : {}) };
  }
  const result = await executeVercelListDeployments({ credentialId, team: context || "personal", project: parent, limit: 25, ...(cursor ? { cursor } : {}) }, "live", workspaceId, credentials, read);
  return { items: result.output.deployments.map((item) => ({ id: item.id, name: `${item.name} · ${item.state} · ${item.id}` })), nextCursor: result.output.nextCursor ?? null, ...(result.output.partial ? { warning: "Some Vercel results or continuation may be unavailable." } : {}) };
}
