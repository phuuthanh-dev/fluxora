import { CredentialProvider } from "@prisma/client";
import { nodeConfigIssues } from "@workflow/contracts";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound, fetchSafeOutboundWrite, wasOutboundRedirected } from "./outbound-url-policy";
import { readProviderJson, uncertainDelivery } from "./provider-request-policy";
import { parseRetryAfter, maximumRetryDelayMs } from "./retry-policy";
import { redactValue } from "./redaction";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
type Operation = "get-project" | "list-issues" | "get-issue" | "create-issue" | "add-comment" | "update-issue" | "get-pipeline" | "get-merge-request";
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const numericId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
export const validGitLabToken = (token: unknown): token is string => typeof token === "string" && /^[A-Za-z0-9._-]{8,512}$/.test(token);

async function request(token: string, path: string, read: Transport, write: Transport, body?: object, writeMethod: "POST" | "PUT" = "POST") {
  if (!validGitLabToken(token)) throw new NodeFailure("CREDENTIAL_INVALID", "Enter a valid GitLab personal access token.", false);
  let response: Response;
  try { response = await (body ? write : read)(`https://gitlab.com/api/v4/${path}`, { method: body ? writeMethod : "GET", headers: { "PRIVATE-TOKEN": token, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) }); }
  catch (error) { if (body) throw uncertainDelivery("GitLab"); throw nodeFailureFromOutboundPolicy(error); }
  if (body && (wasOutboundRedirected(response) || response.status >= 300 && response.status < 400 || response.status === 408 || response.status === 429 || response.status >= 500)) { await response.body?.cancel().catch(() => undefined); throw uncertainDelivery("GitLab", response.status); }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    const delay = response.status === 429 ? parseRetryAfter(response.headers.get("retry-after")) : undefined;
    throw new NodeFailure("HTTP_ERROR", `GitLab returned ${response.status}.`, !body && (response.status >= 500 || response.status === 429 && (delay === undefined || delay <= maximumRetryDelayMs)), response.status, delay);
  }
  const result = await readProviderJson(response, "GitLab", !!body);
  const next = response.headers.get("x-next-page");
  return { result, nextPage: next && /^[1-9]\d{0,4}$/.test(next) && Number(next) <= 10000 ? Number(next) : null };
}

function safe(value: unknown, token: string): unknown {
  if (typeof value === "string") return value.split(token).join("[REDACTED]");
  if (Array.isArray(value)) return value.map((item) => safe(item, token));
  if (record(value)) return Object.fromEntries(Object.entries(value as object).map(([key, child]) => [key, safe(child, token)]));
  return value;
}
function issueView(value: unknown, project: number) {
  const issue = record(value);
  if (!issue || !numericId(issue.id) || !numericId(issue.iid) || issue.project_id !== project || typeof issue.title !== "string" || typeof issue.state !== "string") throw new NodeFailure("INVALID_RESPONSE", "GitLab returned an invalid issue.", false);
  return { id: issue.id, iid: issue.iid, projectId: project, title: issue.title.slice(0, 255), description: typeof issue.description === "string" ? issue.description.slice(0, 10000) : null, state: issue.state };
}

export async function listGitLabProjects(token: string, page = 1, read: Transport = fetchSafeOutbound) {
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new NodeFailure("INVALID_INPUT", "Choose a valid page.", false);
  const { result, nextPage } = await request(token, `projects?membership=true&simple=true&order_by=id&sort=asc&per_page=50&page=${page}`, read, fetchSafeOutboundWrite);
  if (!Array.isArray(result) || result.length > 50) throw new NodeFailure("INVALID_RESPONSE", "GitLab returned an invalid project list.", false);
  const projects = result.map((value) => { const project = record(value); if (!project || !numericId(project.id) || typeof project.path_with_namespace !== "string") throw new NodeFailure("INVALID_RESPONSE", "GitLab returned an invalid project.", false); return { id: String(project.id), name: project.path_with_namespace.split(token).join("[REDACTED]").slice(0, 300) }; });
  return { projects, nextPage };
}

export async function executeGitLab(config: Record<string, unknown>, operation: Operation, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, read: Transport = fetchSafeOutbound, write: Transport = fetchSafeOutboundWrite) {
  const issue = nodeConfigIssues(`action.gitlab.${operation}`, config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_INPUT", issue.message, false);
  const project = Number(config.project), issueNumber = Number(config.issue);
  if (mode === "mock") return { status: "succeeded" as const, route: "success" as const, output: operation === "get-pipeline" ? { pipeline: { id: Number(config.pipeline), projectId: project, status: "success" } } : operation === "get-merge-request" ? { mergeRequest: { iid: Number(config.mergeRequest), projectId: project, title: "Sample merge request", state: "opened" } } : operation === "list-issues" ? { items: [{ id: 1, iid: 1, projectId: project, title: "Sample issue", state: "opened" }], nextPage: null } : operation === "get-project" ? { project: { id: project, name: "Sample project" } } : operation === "add-comment" ? { commentId: 1, issueNumber, projectId: project } : { issue: { id: 1, iid: operation === "create-issue" ? 1 : issueNumber, projectId: project, title: operation === "create-issue" || operation === "update-issue" ? config.title : "Sample issue", state: "opened" } } };
  const credential = await credentials.readForExecution(String(config.credentialId ?? ""), workspaceId, CredentialProvider.GITLAB);
  const token = typeof credential.token === "string" ? credential.token : "";
  const base = `projects/${project}`;
  const pageSize = Number(config.pageSize ?? 20), page = Number(config.page ?? 1);
  const path = operation === "get-project" ? base : operation === "get-pipeline" ? `${base}/pipelines/${Number(config.pipeline)}` : operation === "get-merge-request" ? `${base}/merge_requests/${Number(config.mergeRequest)}` : operation === "list-issues" ? `${base}/issues?scope=all&state=${config.state ?? "opened"}&per_page=${pageSize}&page=${page}` : operation === "create-issue" ? `${base}/issues` : `${base}/issues/${issueNumber}${operation === "add-comment" ? "/notes" : ""}`;
  const body = operation === "create-issue" ? { title: config.title, description: config.description ?? "" } : operation === "update-issue" ? { title: config.title, ...(typeof config.description === "string" && config.description ? { description: config.description } : {}) } : operation === "add-comment" ? { body: config.body } : undefined;
  const { result, nextPage } = await request(token, path, read, write, body, operation === "update-issue" ? "PUT" : "POST");
  let output: Record<string, unknown>;
  try {
    if (operation === "get-pipeline") {
      const item = record(result);
      if (!item || item.id !== Number(config.pipeline) || item.project_id !== project || typeof item.status !== "string") throw new Error();
      output = { pipeline: { id: item.id, projectId: project, status: item.status, ref: typeof item.ref === "string" ? item.ref.slice(0, 255) : null, sha: typeof item.sha === "string" ? item.sha.slice(0, 64) : null } };
    } else if (operation === "get-merge-request") {
      const item = record(result);
      if (!item || item.iid !== Number(config.mergeRequest) || item.project_id !== project || typeof item.title !== "string" || typeof item.state !== "string") throw new Error();
      output = { mergeRequest: { iid: item.iid, projectId: project, title: item.title.slice(0, 255), state: item.state } };
    } else if (operation === "get-project") {
      const item = record(result);
      if (!item || item.id !== project || typeof item.name !== "string" || typeof item.path_with_namespace !== "string") throw new Error();
      output = { project: { id: item.id, name: item.name.slice(0, 255), path: item.path_with_namespace.slice(0, 500), defaultBranch: typeof item.default_branch === "string" ? item.default_branch : null, visibility: typeof item.visibility === "string" ? item.visibility : null } };
    } else if (operation === "list-issues") {
      if (!Array.isArray(result) || result.length > pageSize) throw new Error();
      output = { items: result.map((item) => issueView(item, project)), nextPage };
    } else if (operation === "add-comment") {
      const item = record(result);
      if (!item || !numericId(item.id) || item.noteable_iid !== issueNumber || item.noteable_type !== "Issue") throw new Error();
      output = { commentId: item.id, issueNumber, projectId: project };
    } else { const item = issueView(result, project); if ((operation === "get-issue" || operation === "update-issue") && item.iid !== issueNumber) throw new Error(); output = { issue: item }; }
  } catch { if (body) throw uncertainDelivery("GitLab"); throw new NodeFailure("INVALID_RESPONSE", "GitLab returned an invalid response.", false); }
  return { status: "succeeded" as const, route: "success" as const, output: redactValue(safe(output, token)) as Record<string, unknown> };
}

/** Provider resource discovery stores pipeline IDs and project-scoped MR IIDs. */
export async function listGitLabResources(token: string, project: string, kind: "pipelines" | "merge_requests", page = 1, read: Transport = fetchSafeOutbound) {
  if (!/^[1-9]\d{0,14}$/.test(project) || !Number.isSafeInteger(Number(project)) || !Number.isInteger(page) || page < 1 || page > 10000) throw new NodeFailure("INVALID_INPUT", "Choose a valid project and page.", false);
  const { result, nextPage } = await request(token, `projects/${project}/${kind}?per_page=50&page=${page}${kind === "merge_requests" ? "&scope=all&state=all" : ""}`, read, fetchSafeOutboundWrite);
  if (!Array.isArray(result) || result.length > 50) throw new NodeFailure("INVALID_RESPONSE", "GitLab returned invalid resources.", false);
  const items = result.map((value) => {
    const item = record(value), id = kind === "pipelines" ? item?.id : item?.iid;
    if (!item || !numericId(id) || item.project_id !== Number(project)) throw new NodeFailure("INVALID_RESPONSE", "GitLab returned a resource outside the selected project.", false);
    const label = kind === "pipelines" ? `${item.status ?? ""} · ${item.ref ?? ""}` : item.title;
    if (typeof label !== "string") throw new NodeFailure("INVALID_RESPONSE", "GitLab returned an invalid resource name.", false);
    return { id: String(id), name: `#${id} · ${label.split(token).join("[REDACTED]").slice(0, 250)}` };
  });
  return { items, nextPage: nextPage && nextPage > page ? nextPage : null };
}
