import { CredentialProvider } from "@prisma/client";
import { nodeConfigIssues } from "@workflow/contracts";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound, fetchSafeOutboundWrite, wasOutboundRedirected } from "./outbound-url-policy";
import { readProviderJson, uncertainDelivery } from "./provider-request-policy";
import { redactValue } from "./redaction";
type Transport = (url: string, init: RequestInit) => Promise<Response>;
type Operation = "create-issue" | "get-issue" | "update-issue" | "add-comment";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const safe = (value: string, token: unknown) => typeof token === "string" && token ? value.split(token).join("[REDACTED]") : value;
const adf = (text: string) => ({ type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
async function request(data: Record<string, unknown>, path: string, read: Transport, write: Transport, method: "GET" | "POST" | "PUT" = "GET", body?: object) {
  const token = data.accessToken, cloudId = data.cloudId;
  if (typeof token !== "string" || !token || typeof cloudId !== "string" || !uuid.test(cloudId)) throw new NodeFailure("CREDENTIAL_INVALID", "Reconnect the Jira site.", false);
  const isWrite = method !== "GET";
  let response: Response;
  try { response = await (isWrite ? write : read)(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/${path}`, { method, headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(isWrite ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) }); }
  catch (error) { if (isWrite) throw uncertainDelivery("Jira"); throw nodeFailureFromOutboundPolicy(error); }
  if (isWrite && (wasOutboundRedirected(response) || response.status >= 300 && response.status < 400 || response.status === 408 || response.status === 429 || response.status >= 500)) { await response.body?.cancel().catch(() => undefined); throw uncertainDelivery("Jira", response.status); }
  if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new NodeFailure("HTTP_ERROR", `Jira returned ${response.status}.`, !isWrite && response.status >= 500, response.status); }
  if (response.status === 204) return null;
  return readProviderJson(response, "Jira", isWrite);
}
async function connection(credentials: CredentialService, credentialId: string, workspaceId: string) { return credentials.readForExecution(credentialId, workspaceId, CredentialProvider.JIRA); }
export async function listJiraProjects(credentialId: string, workspaceId: string, credentials: CredentialService, read: Transport = fetchSafeOutbound) {
  return credentials.runJiraOperation(credentialId, workspaceId, async () => {
    const data = await connection(credentials, credentialId, workspaceId), raw = object(await request(data, "project/search?maxResults=50", read, fetchSafeOutboundWrite));
    if (!Array.isArray(raw.values)) throw new NodeFailure("INVALID_RESPONSE", "Jira returned invalid projects.", false);
    return { projects: raw.values.slice(0, 50).map(object).filter((v) => typeof v.id === "string" && /^\d+$/.test(v.id) && typeof v.name === "string").map((v) => ({ id: v.id, name: safe(safe(String(v.name).slice(0, 200), data.accessToken), data.refreshToken) })), hasMore: raw.isLast === false };
  });
}
export async function listJiraIssueTypes(credentialId: string, workspaceId: string, projectId: string, credentials: CredentialService, read: Transport = fetchSafeOutbound) {
  if (!/^\d{1,20}$/.test(projectId)) throw new NodeFailure("INVALID_INPUT", "Select a Jira project.", false);
  return credentials.runJiraOperation(credentialId, workspaceId, async () => {
    const data = await connection(credentials, credentialId, workspaceId), raw = object(await request(data, `issue/createmeta/${projectId}/issuetypes?maxResults=50`, read, fetchSafeOutboundWrite));
    if (!Array.isArray(raw.issueTypes)) throw new NodeFailure("INVALID_RESPONSE", "Jira returned invalid issue types.", false);
    return { issueTypes: raw.issueTypes.slice(0, 50).map(object).filter((v) => v.subtask !== true && typeof v.id === "string" && /^\d+$/.test(v.id) && typeof v.name === "string").map((v) => ({ id: v.id, name: safe(safe(String(v.name).slice(0, 200), data.accessToken), data.refreshToken) })), hasMore: typeof raw.total === "number" && raw.total > 50 };
  });
}
export async function executeJira(config: Record<string, unknown>, operation: Operation, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, read: Transport = fetchSafeOutbound, write: Transport = fetchSafeOutboundWrite) {
  const issue = nodeConfigIssues(`action.jira.${operation}`, config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_INPUT", issue.message, false);
  if (mode === "mock") return { status: "succeeded" as const, route: "success" as const, output: operation === "add-comment" ? { issueKey: String(config.issue), commentId: "10001" } : { issue: { id: "10001", key: operation === "create-issue" ? "DEMO-1" : String(config.issue), summary: String(config.summary ?? "Sample issue") } } };
  const credentialId = String(config.credentialId ?? "");
  return credentials.runJiraOperation(credentialId, workspaceId, async () => {
    const data = await connection(credentials, credentialId, workspaceId), key = String(config.issue ?? ""), project = String(config.project ?? ""), type = String(config.issueType ?? "");
    const path = operation === "create-issue" ? "issue" : `issue/${encodeURIComponent(key)}${operation === "add-comment" ? "/comment" : ""}`;
    const method = operation === "create-issue" || operation === "add-comment" ? "POST" : operation === "update-issue" ? "PUT" : "GET";
    const body = operation === "create-issue" ? { fields: { project: { id: project }, issuetype: { id: type }, summary: config.summary, ...(config.description ? { description: adf(String(config.description)) } : {}) } } : operation === "update-issue" ? { fields: { summary: config.summary } } : operation === "add-comment" ? { body: adf(String(config.comment)) } : undefined;
    const result = await request(data, path, read, write, method, body);
    if (operation === "update-issue") return { status: "succeeded" as const, route: "success" as const, output: { issue: { key, updated: true } } };
    const item = object(result), fields = object(item.fields);
    if (operation === "add-comment") { if (typeof item.id !== "string" || !/^\d+$/.test(item.id)) throw uncertainDelivery("Jira"); return { status: "succeeded" as const, route: "success" as const, output: { issueKey: key, commentId: item.id } }; }
    if (typeof item.id !== "string" || !/^\d+$/.test(item.id) || typeof item.key !== "string" || !/^[A-Z][A-Z0-9_]*-\d+$/.test(item.key) || operation === "get-issue" && item.key !== key) { if (operation === "create-issue") throw uncertainDelivery("Jira"); throw new NodeFailure("INVALID_RESPONSE", "Jira returned an invalid issue.", false); }
    const resultIssue = { id: item.id, key: item.key, ...(typeof fields.summary === "string" ? { summary: safe(safe(fields.summary.slice(0, 255), data.accessToken), data.refreshToken) } : {}) };
    return { status: "succeeded" as const, route: "success" as const, output: { issue: redactValue(resultIssue) } };
  });
}
