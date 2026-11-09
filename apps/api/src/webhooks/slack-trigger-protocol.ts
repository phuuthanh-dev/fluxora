import { BadRequestException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";

export const SLACK_EVENT_MAX_BYTES = 256 * 1024;
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Z][A-Z0-9]{2,63}$/.test(value);
const invalid = () => new BadRequestException({ code: "SLACK_EVENT_INVALID", message: "Slack event data is invalid." });

export function verifySlackSignature(raw: unknown, signature: unknown, timestamp: unknown, secret: unknown, now = Date.now()) {
  if (!Buffer.isBuffer(raw) || raw.length > SLACK_EVENT_MAX_BYTES || typeof signature !== "string" || !/^v0=[a-f0-9]{64}$/.test(signature) || typeof timestamp !== "string" || !/^\d{10}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300 || typeof secret !== "string" || !secret || secret.length > 1024) return false;
  const expected = createHmac("sha256", secret).update(`v0:${timestamp}:`).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(3), "hex"));
}

export function readSlackEnvelope(raw: Buffer) {
  if (!Buffer.isBuffer(raw) || raw.length > SLACK_EVENT_MAX_BYTES) throw invalid();
  let body: Record<string, unknown> | undefined;
  try { body = object(JSON.parse(raw.toString("utf8"))); } catch { throw invalid(); }
  if (!body || typeof body.type !== "string") throw invalid();
  if (body.type === "url_verification") {
    if (typeof body.challenge !== "string" || !/^[A-Za-z0-9_-]{1,512}$/.test(body.challenge)) throw invalid();
    return { kind: "challenge" as const, challenge: body.challenge };
  }
  if (body.type !== "event_callback") return { kind: "ignored" as const };
  const event = object(body.event);
  if (typeof body.event_id !== "string" || !/^[A-Za-z0-9_-]{3,160}$/.test(body.event_id) || !id(body.team_id) || !id(body.api_app_id) || !event) throw invalid();
  return { kind: "event" as const, eventId: body.event_id, teamId: body.team_id, appId: body.api_app_id, event };
}

/** Only explicit message fields cross into execution history; ignore bot/system/edit/delete events. */
export function normalizeSlackEvent(envelope: ReturnType<typeof readSlackEnvelope>, config: Record<string, unknown>, teamId: unknown, secret: string) {
  if (envelope.kind !== "event") return null;
  const event = envelope.event;
  if (envelope.teamId !== teamId || event.type !== config.event || event.channel !== config.channel || event.bot_id || event.bot_profile || event.subtype || event.hidden === true) return null;
  if (!id(event.channel) || !id(event.user) || typeof event.ts !== "string" || !/^\d{10,16}\.\d{1,10}$/.test(event.ts) || typeof event.text !== "string" || event.text.length > 40000) throw invalid();
  if (event.thread_ts !== undefined && (typeof event.thread_ts !== "string" || !/^\d{10,16}\.\d{1,10}$/.test(event.thread_ts))) throw invalid();
  const payload = { source: "slack", event: String(event.type), eventId: envelope.eventId, teamId: envelope.teamId, channel: event.channel, user: event.user, text: event.text, timestamp: event.ts, threadTimestamp: event.thread_ts ?? null };
  if (Object.values(payload).some((value) => typeof value === "string" && value.includes(secret))) throw invalid();
  return payload;
}
