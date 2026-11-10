import { JwtService } from "@nestjs/jwt";
import { createHmac, timingSafeEqual } from "node:crypto";
import { jiraIssueEvents, type JiraIssueEvent } from "./jira-webhook-adapter";

const jwt = new JwtService();
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Atlassian documents a bearer JWT signed with the OAuth app client secret. */
export function jiraDeliveryToken(clientSecret: string, endpointId: string): string {
  return createHmac("sha256", clientSecret).update(`jira-webhook:${endpointId}`).digest("hex");
}

export function verifyJiraBearer(authorization: string | undefined, clientSecret: string | undefined, endpointId: string, delivery: string | undefined, now = Date.now()): boolean {
  if (!clientSecret || !endpointId || !delivery || !/^[a-f0-9]{64}$/.test(delivery) || !authorization || authorization.length > 8192 || !authorization.startsWith("Bearer ")) return false;
  try {
    const expected = Buffer.from(jiraDeliveryToken(clientSecret, endpointId), "hex");
    if (!timingSafeEqual(expected, Buffer.from(delivery, "hex"))) return false;
    const claims = jwt.verify<Record<string, unknown>>(authorization.slice(7), { secret: clientSecret, algorithms: ["HS256"], clockTimestamp: Math.floor(now / 1000), clockTolerance: 30 });
    const issued = claims.iat, expiry = claims.exp, seconds = Math.floor(now / 1000);
    if (typeof issued !== "number" || !Number.isSafeInteger(issued) || issued > seconds + 30 || typeof expiry !== "number" || !Number.isSafeInteger(expiry) || expiry <= issued || expiry > issued + 3600) return false;
    // Jira OAuth 3LO JWTs do not authenticate the URL or body. The separate
    // delivery token binds a valid bearer to this endpoint, but the body is
    // still not cryptographically signed by Jira.
    return true;
  } catch { return false; }
}

/** Do not persist the bearer token, arbitrary provider payload or unrelated events. */
export function normalizeJiraIssueEvent(raw: unknown, input: { projectId: string; event: JiraIssueEvent; remoteHookId: number; deliveryId: string | undefined }) {
  const payload = object(raw), issue = object(payload.issue), fields = object(issue.fields), project = object(fields.project);
  if (!jiraIssueEvents.includes(input.event) || payload.webhookEvent !== input.event) return null;
  if (!Number.isSafeInteger(input.remoteHookId) || input.remoteHookId <= 0 || !Array.isArray(payload.matchedWebhookIds) || !payload.matchedWebhookIds.includes(input.remoteHookId)) return null;
  if (!/^\d{1,20}$/.test(input.projectId) || project.id !== input.projectId) return null;
  if (typeof input.deliveryId !== "string" || !/^[\x21-\x7e]{1,160}$/.test(input.deliveryId)) return null;
  if (typeof issue.id !== "string" || !/^\d{1,20}$/.test(issue.id) || typeof issue.key !== "string" || !/^[A-Z][A-Z0-9_]*-\d+$/.test(issue.key)) return null;
  const summary = typeof fields.summary === "string" ? fields.summary.slice(0, 255) : null;
  return { source: "jira", event: input.event, issue: { id: issue.id, key: issue.key, summary }, deliveryId: input.deliveryId };
}
