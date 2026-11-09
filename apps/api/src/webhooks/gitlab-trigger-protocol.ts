import { BadRequestException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";

export const GITLAB_EVENT_MAX_BYTES = 256 * 1024;
export type GitLabHeaders = { event?: string; id?: string; timestamp?: string; signature?: string };
export const validGitLabSigningToken = (value: unknown): value is string => typeof value === "string" && /^whsec_[A-Za-z0-9+/]{43}=$/.test(value) && Buffer.from(value.slice(6), "base64").length === 32;
export function verifyGitLabSignature(raw: unknown, headers: GitLabHeaders, secret: unknown, now = Date.now()): boolean {
  if (!Buffer.isBuffer(raw) || raw.length > GITLAB_EVENT_MAX_BYTES || !validGitLabSigningToken(secret) || !headers.id || !/^[A-Za-z0-9_-]{1,160}$/.test(headers.id) || !headers.timestamp || !/^\d{10}$/.test(headers.timestamp) || Math.abs(now / 1000 - Number(headers.timestamp)) > 300 || !headers.signature || headers.signature.length > 1024) return false;
  const expected = createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`${headers.id}.${headers.timestamp}.`).update(raw).digest();
  return headers.signature.split(" ").some((signature) => {
    if (!/^v1,[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
    const digest = Buffer.from(signature.slice(3), "base64");
    return digest.length === expected.length && timingSafeEqual(digest, expected);
  });
}
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const id = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const text = (value: unknown, max = 1000): string | null => typeof value === "string" ? value.slice(0, max) : null;
const invalid = () => new BadRequestException({ code: "GITLAB_EVENT_INVALID", message: "GitLab event data is invalid." });

/** Explicit event fields only: CI variables, secrets and repository credentials are omitted. */
export function normalizeGitLabEvent(raw: Buffer, headers: GitLabHeaders, type: string, config: Record<string, unknown>) {
  if (raw.length > GITLAB_EVENT_MAX_BYTES) throw invalid();
  let body: Record<string, unknown> | undefined;
  try { body = record(JSON.parse(raw.toString("utf8"))); } catch { throw invalid(); }
  if (!body) throw invalid();
  const pipeline = type === "trigger.gitlab.pipeline";
  if (headers.event !== (pipeline ? "Pipeline Hook" : "Merge Request Hook") || body.object_kind !== (pipeline ? "pipeline" : "merge_request")) return null;
  const project = record(body.project), attributes = record(body.object_attributes);
  if (!project || !id(project.id) || !attributes || !id(attributes.id)) throw invalid();
  if (project.id !== Number(config.project)) return null;
  const base = { source: "gitlab", eventId: headers.id!, projectId: project.id, projectPath: text(project.path_with_namespace), event: pipeline ? "pipeline" : "merge_request" };
  if (pipeline) {
    if (typeof attributes.status !== "string") throw invalid();
    if (config.status && config.status !== "all" && config.status !== attributes.status) return null;
    return { ...base, pipeline: { id: attributes.id, status: text(attributes.status, 50), ref: text(attributes.ref), sha: text(attributes.sha, 64), source: text(attributes.source, 100) } };
  }
  if (!id(attributes.iid) || typeof attributes.action !== "string") throw invalid();
  if (!["open", "update", "merge", "close", "reopen"].includes(attributes.action) || (config.action ?? "open") !== "all" && (config.action ?? "open") !== attributes.action) return null;
  return { ...base, mergeRequest: { id: attributes.id, iid: attributes.iid, action: attributes.action, title: text(attributes.title, 255), state: text(attributes.state, 50), sourceBranch: text(attributes.source_branch), targetBranch: text(attributes.target_branch) } };
}
