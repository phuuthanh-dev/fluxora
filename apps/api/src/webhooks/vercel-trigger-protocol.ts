import { BadRequestException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";

export const VERCEL_WEBHOOK_MAX_BYTES = 256 * 1024;
export type VercelDeploymentEvent = "deployment.created" | "deployment.canceled" | "deployment.ready" | "deployment.succeeded" | "deployment.error";
export type VercelDeploymentFilter = { event: VercelDeploymentEvent; projectId: string; owner: "team" | "personal"; teamId?: string };
const events: readonly VercelDeploymentEvent[] = ["deployment.created", "deployment.canceled", "deployment.ready", "deployment.succeeded", "deployment.error"];
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(value);
const invalid = () => new BadRequestException({ code: "VERCEL_WEBHOOK_INVALID", message: "Vercel webhook data is invalid." });

/** Account-webhook signing secret is separate from the Vercel API token. */
export function verifyVercelSignature(raw: unknown, signature: unknown, secret: unknown) {
  if (!Buffer.isBuffer(raw) || raw.length > VERCEL_WEBHOOK_MAX_BYTES || typeof signature !== "string" || !/^[a-f0-9]{40}$/i.test(signature) || typeof secret !== "string" || !secret.length || Buffer.byteLength(secret, "utf8") > 1024) return false;
  const expected = createHmac("sha1", secret).update(raw).digest();
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && timingSafeEqual(expected, actual);
}

export function readVercelDeploymentFilter(value: unknown): VercelDeploymentFilter {
  const config = object(value);
  if (!config || typeof config.event !== "string" || !events.includes(config.event as VercelDeploymentEvent) || !id(config.projectId) || (config.owner !== "team" && config.owner !== "personal")) throw invalid();
  if (config.owner === "team") {
    if (!id(config.teamId)) throw invalid();
    return { event: config.event as VercelDeploymentEvent, projectId: config.projectId, owner: "team", teamId: config.teamId };
  }
  if (config.teamId !== undefined && config.teamId !== "") throw invalid();
  return { event: config.event as VercelDeploymentEvent, projectId: config.projectId, owner: "personal" };
}

/** The picker uses the existing `personal` account sentinel and project ID. */
export function vercelTriggerFilterFromConfig(config: Record<string, unknown>) {
  return readVercelDeploymentFilter(config.team === "personal"
    ? { event: config.event, projectId: config.project, owner: "personal" }
    : { event: config.event, projectId: config.project, owner: "team", teamId: config.team });
}

/** Call only after verifying the signature; never persist raw deployment metadata. */
export function normalizeVercelDeployment(raw: Buffer, filter: VercelDeploymentFilter, signingSecret?: string) {
  const config = readVercelDeploymentFilter(filter);
  if (!Buffer.isBuffer(raw) || raw.length > VERCEL_WEBHOOK_MAX_BYTES) throw invalid();
  let body: Record<string, unknown> | undefined;
  try { body = object(JSON.parse(raw.toString("utf8"))); } catch { throw invalid(); }
  if (!body || !id(body.id) || typeof body.type !== "string") throw invalid();
  if (body.type !== config.event) return { kind: "ignored" as const, eventId: body.id };
  const payload = object(body.payload), project = object(payload?.project), deployment = object(payload?.deployment);
  if (!payload || !project || !deployment || !id(project.id) || !id(deployment.id)) throw invalid();
  const team = payload.team === null ? null : object(payload.team);
  const teamId = team === null ? null : team?.id;
  if (teamId !== null && !id(teamId)) throw invalid();
  if (project.id !== config.projectId || (config.owner === "team" ? teamId !== config.teamId : teamId !== null)) return { kind: "ignored" as const, eventId: body.id };
  // These identifiers are used for routing and deduplication: do not redact
  // them into a different value if the provider echoes the signing secret.
  if (signingSecret && [body.id, config.event, project.id, deployment.id, teamId, "vercel"].some((value) => value?.includes(signingSecret))) throw invalid();
  return { kind: "accepted" as const, eventId: body.id, payload: { source: "vercel", event: config.event, eventId: body.id, projectId: project.id, deploymentId: deployment.id, teamId } };
}
