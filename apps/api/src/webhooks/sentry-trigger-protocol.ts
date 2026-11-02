import { BadRequestException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";

export const SENTRY_WEBHOOK_MAX_BYTES = 256 * 1024;
export type SentryIssueCreatedFilter = { installationId: string; project: string };
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const uuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const slug = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,99}$/i.test(value);
const numericId = (value: unknown): value is string => typeof value === "string" && /^[1-9][0-9]{0,29}$/.test(value);
const invalid = () => new BadRequestException({ code: "SENTRY_WEBHOOK_INVALID", message: "Sentry webhook data is invalid." });

/** This is the custom-integration protocol, not project service hooks. */
export function verifySentryIntegrationSignature(raw: unknown, signature: unknown, clientSecret: unknown) {
  if (!Buffer.isBuffer(raw) || raw.length > SENTRY_WEBHOOK_MAX_BYTES || typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature) || typeof clientSecret !== "string" || !clientSecret.length || Buffer.byteLength(clientSecret) > 1024) return false;
  const actual = Buffer.from(signature, "hex"), expected = createHmac("sha256", clientSecret).update(raw).digest();
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function readSentryIssueCreatedFilter(value: unknown): SentryIssueCreatedFilter {
  const input = object(value);
  if (!input || !uuid(input.installationId) || !slug(input.project)) throw invalid();
  return { installationId: input.installationId.toLowerCase(), project: input.project.toLowerCase() };
}

/** A created issue ID is stable for that installation; unlike Sentry's
 * Request-ID header it is present in the signed body. Repeated issue updates
 * do not have this invariant and are intentionally not treated as unique. */
export function normalizeSentryIssueCreated(raw: Buffer, resource: unknown, filter: SentryIssueCreatedFilter, clientSecret?: string) {
  const config = readSentryIssueCreatedFilter(filter);
  if (!Buffer.isBuffer(raw) || raw.length > SENTRY_WEBHOOK_MAX_BYTES || typeof resource !== "string") throw invalid();
  if (resource !== "issue") return { kind: "ignored" as const };
  let body: Record<string, unknown> | undefined;
  try { body = object(JSON.parse(raw.toString("utf8"))); } catch { throw invalid(); }
  const installation = object(body?.installation), data = object(body?.data), issue = object(data?.issue), project = object(issue?.project);
  if (!body || typeof body.action !== "string") throw invalid();
  if (body.action !== "created") return { kind: "ignored" as const };
  if (!uuid(installation?.uuid) || !issue || !numericId(issue.id) || !project || !slug(project.slug)) throw invalid();
  if (installation.uuid.toLowerCase() !== config.installationId || project.slug.toLowerCase() !== config.project) return { kind: "ignored" as const };
  const title = typeof issue.title === "string" ? (clientSecret ? issue.title.split(clientSecret).join("[REDACTED]") : issue.title).slice(0, 500) : null;
  const level = typeof issue.level === "string" && ["fatal", "error", "warning", "info", "debug"].includes(issue.level) ? issue.level : null;
  return { kind: "accepted" as const, deliveryKey: `${config.installationId}:${issue.id}`, payload: { source: "sentry", event: "issue.created", installationId: config.installationId, project: config.project, issueId: issue.id, title, level } };
}
