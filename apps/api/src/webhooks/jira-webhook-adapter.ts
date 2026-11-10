import { readBoundedProviderJson } from "../execution/provider-json";
import { fetchSafeOutboundWrite } from "../execution/outbound-url-policy";
import { NodeFailure } from "../execution/node-failure";
import { ProviderWebhookError } from "./provider-webhook-adapter";

/** Jira Cloud dynamic webhook events supported by this issue-focused trigger. */
export const jiraIssueEvents = ["jira:issue_created", "jira:issue_updated", "jira:issue_deleted"] as const;
export type JiraIssueEvent = typeof jiraIssueEvents[number];
type Transport = (url: string, init?: RequestInit) => Promise<Response>;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** One request per operation; an ambiguous write must not be repeated blindly. */
export class JiraWebhookAdapter {
  constructor(private readonly transport: Transport = fetchSafeOutboundWrite) {}

  async create(auth: { cloudId: string; accessToken: string }, input: { url: string; projectId: string; event: JiraIssueEvent }) {
    let url: URL;
    try { url = new URL(input.url); } catch { throw new ProviderWebhookError("INVALID_INPUT", false); }
    if (url.protocol !== "https:" || url.username || url.password || url.hash || !/^\d{1,20}$/.test(input.projectId) || !jiraIssueEvents.includes(input.event)) throw new ProviderWebhookError("INVALID_INPUT", false);
    const response = await this.request(auth, "POST", "", { url: url.href, webhooks: [{ events: [input.event], jqlFilter: `project = ${input.projectId}` }] });
    let body: Record<string, unknown>;
    try { body = object(await readBoundedProviderJson(response)); } catch { throw new ProviderWebhookError("OUTCOME_UNKNOWN", false); }
    const results = body.webhookRegistrationResult;
    if (!Array.isArray(results) || results.length !== 1) throw new ProviderWebhookError("OUTCOME_UNKNOWN", false);
    const result = object(results[0]);
    if (Array.isArray(result.errors) && result.errors.length && result.createdWebhookId === undefined) throw new ProviderWebhookError("CONFLICT", false);
    if (!Number.isSafeInteger(result.createdWebhookId) || (result.createdWebhookId as number) <= 0) throw new ProviderWebhookError("OUTCOME_UNKNOWN", false);
    return result.createdWebhookId as number;
  }

  async refresh(auth: { cloudId: string; accessToken: string }, webhookId: number) {
    const response = await this.request(auth, "PUT", "/refresh", { webhookIds: [validId(webhookId)] });
    let body: Record<string, unknown>;
    try { body = object(await readBoundedProviderJson(response)); } catch { throw new ProviderWebhookError("OUTCOME_UNKNOWN", false); }
    if (typeof body.expirationDate !== "string" || !Number.isFinite(Date.parse(body.expirationDate)) || Date.parse(body.expirationDate) <= Date.now()) throw new ProviderWebhookError("OUTCOME_UNKNOWN", false);
    return new Date(body.expirationDate);
  }

  /** Read only the registered hook identity; never return the callback URL to a caller. */
  async inspect(auth: { cloudId: string; accessToken: string }, expected: { id: number; url: string; projectId: string; event: JiraIssueEvent }) {
    validId(expected.id);
    if (!/^\d{1,20}$/.test(expected.projectId) || !jiraIssueEvents.includes(expected.event)) throw new ProviderWebhookError("INVALID_INPUT", false);
    const entries = await this.list(auth);
    const matches = entries.filter((entry) => entry.id === expected.id);
    if (matches.length > 1) throw new ProviderWebhookError("UNAVAILABLE", true);
    if (matches.length === 0) return { found: false, matches: false, expirationDate: null };
    const match = matches[0]!;
    return {
      found: true,
      matches: sameHook(match, expected),
      expirationDate: typeof match.expirationDate === "string" && Number.isFinite(Date.parse(match.expirationDate)) ? new Date(match.expirationDate) : null,
    };
  }

  /** Find only exact matches after an ambiguous create; never expose provider URLs. */
  async findMatching(auth: { cloudId: string; accessToken: string }, expected: { url: string; projectId: string; event: JiraIssueEvent }) {
    if (!/^\d{1,20}$/.test(expected.projectId) || !jiraIssueEvents.includes(expected.event)) throw new ProviderWebhookError("INVALID_INPUT", false);
    const entries = await this.list(auth);
    const matches = entries.filter((entry) => sameHook(entry, expected));
    if (matches.some((entry) => !Number.isSafeInteger(entry.id) || (entry.id as number) <= 0)) throw new ProviderWebhookError("UNAVAILABLE", true);
    return matches.map((entry) => entry.id as number);
  }

  private async list(auth: { cloudId: string; accessToken: string }) {
    const response = await this.request(auth, "GET", "?startAt=0&maxResults=50");
    let body: Record<string, unknown>;
    try { body = object(await readBoundedProviderJson(response)); } catch { throw new ProviderWebhookError("UNAVAILABLE", true); }
    if (!Array.isArray(body.values) || body.isLast !== true) throw new ProviderWebhookError("UNAVAILABLE", true);
    return body.values.map(object);
  }

  async remove(auth: { cloudId: string; accessToken: string }, webhookId: number) {
    const response = await this.request(auth, "DELETE", "", { webhookIds: [validId(webhookId)] });
    await response.body?.cancel().catch(() => undefined);
  }

  private async request(auth: { cloudId: string; accessToken: string }, method: "GET" | "POST" | "PUT" | "DELETE", suffix: string, body?: object) {
    if (!uuid.test(auth.cloudId) || !auth.accessToken || /[\s\u0000-\u001f\u007f]/.test(auth.accessToken)) throw new ProviderWebhookError("INVALID_INPUT", false);
    let response: Response;
    try {
      response = await this.transport(`https://api.atlassian.com/ex/jira/${auth.cloudId}/rest/api/3/webhook${suffix}`, { method, headers: { authorization: `Bearer ${auth.accessToken}`, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(15_000) });
    } catch { throw new ProviderWebhookError(method === "GET" ? "UNAVAILABLE" : "OUTCOME_UNKNOWN", method === "GET"); }
    if (response.ok) return response;
    await response.body?.cancel().catch(() => undefined);
    // A definite 401 has not authorized the write; use the existing serialized
    // Jira refresh flow. A 403 can instead mean missing webhook permission.
    if (response.status === 401) throw new NodeFailure("JIRA_UNAUTHORIZED", "Reconnect your Jira site.", false, 401);
    if (response.status === 403) throw new ProviderWebhookError("FORBIDDEN", false);
    if ([400, 404, 409, 422].includes(response.status)) throw new ProviderWebhookError("CONFLICT", false);
    throw new ProviderWebhookError(method === "GET" ? "UNAVAILABLE" : "OUTCOME_UNKNOWN", method === "GET");
  }
}

function sameHook(entry: Record<string, unknown>, expected: { url: string; projectId: string; event: JiraIssueEvent }) {
  return entry.url === expected.url && entry.jqlFilter === `project = ${expected.projectId}` && Array.isArray(entry.events) && entry.events.length === 1 && entry.events[0] === expected.event;
}

function validId(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new ProviderWebhookError("INVALID_INPUT", false);
  return id;
}
