import { BadRequestException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";

export const TRELLO_WEBHOOK_MAX_BYTES = 256 * 1024;
export type TrelloTriggerFilter = { boardId: string; action: "all" | "createCard" | "updateCard" | "commentCard" | "deleteCard" };
const actions = ["all", "createCard", "updateCard", "commentCard", "deleteCard"] as const;
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const id = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);
const invalid = () => new BadRequestException({ code: "TRELLO_WEBHOOK_INVALID", message: "Trello webhook data is invalid." });

/** The owner supplies the exact public URL used for Trello registration. */
export function readTrelloCallbackUrl(value: unknown, path: string) {
  if (typeof value !== "string" || value.length > 2048 || !/^[a-z0-9][a-z0-9-]{2,80}$/i.test(path)) throw invalid();
  let url: URL;
  try { url = new URL(value); } catch { throw invalid(); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.port || url.toString() !== value || !url.pathname.endsWith(`/webhooks/${path}`)) throw invalid();
  return value;
}

/** Trello signs the exact incoming bytes followed by the exact registered URL.
 * The URL must be stored at registration, never reconstructed from Host. */
export function verifyTrelloSignature(raw: unknown, signature: unknown, secret: unknown, callbackUrl: unknown) {
  if (!Buffer.isBuffer(raw) || raw.length > TRELLO_WEBHOOK_MAX_BYTES || typeof signature !== "string" || !/^[A-Za-z0-9+/]{27}=$/.test(signature) || typeof secret !== "string" || !secret.length || Buffer.byteLength(secret) > 1024 || typeof callbackUrl !== "string" || callbackUrl.length > 2048) return false;
  try {
    const url = new URL(callbackUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.toString() !== callbackUrl) return false;
  } catch { return false; }
  const actual = Buffer.from(signature, "base64");
  if (actual.length !== 20 || actual.toString("base64") !== signature) return false;
  const expected = createHmac("sha1", secret).update(raw).update(callbackUrl, "utf8").digest();
  return timingSafeEqual(expected, actual);
}

export function readTrelloTriggerFilter(value: unknown): TrelloTriggerFilter {
  const input = record(value);
  if (!input || !id(input.boardId) || typeof input.action !== "string" || !actions.includes(input.action as TrelloTriggerFilter["action"])) throw invalid();
  return { boardId: input.boardId.toLowerCase(), action: input.action as TrelloTriggerFilter["action"] };
}

/** Call only after signature validation. Never persist the full provider body. */
export function normalizeTrelloAction(raw: Buffer, filter: TrelloTriggerFilter, signingSecret?: string) {
  const config = readTrelloTriggerFilter(filter);
  if (!Buffer.isBuffer(raw) || raw.length > TRELLO_WEBHOOK_MAX_BYTES) throw invalid();
  let body: Record<string, unknown> | undefined;
  try { body = record(JSON.parse(raw.toString("utf8"))); } catch { throw invalid(); }
  const webhook = record(body?.webhook), model = record(body?.model), action = record(body?.action);
  if (!webhook || !model || !action || !id(webhook.idModel) || !id(model.id) || !id(action.id) || typeof action.type !== "string" || !/^[A-Za-z][A-Za-z0-9]{0,79}$/.test(action.type)) throw invalid();
  if (webhook.idModel.toLowerCase() !== config.boardId || model.id.toLowerCase() !== config.boardId || (config.action !== "all" && action.type !== config.action)) return { kind: "ignored" as const, actionId: action.id.toLowerCase() };
  const data = record(action.data), card = record(data?.card), list = record(data?.listAfter) ?? record(data?.list);
  const cardId = id(card?.id) ? card.id.toLowerCase() : null;
  const listId = id(list?.id) ? list.id.toLowerCase() : null;
  // Provider content may contain the app secret. Remove it before truncation so
  // a boundary cannot leave a partial secret in execution history.
  const scrub = (value: unknown, limit: number) => typeof value === "string" ? (signingSecret ? value.split(signingSecret).join("[REDACTED]") : value).slice(0, limit) : null;
  const cardName = scrub(card?.name, 512);
  const text = scrub(data?.text, 4096);
  // IDs feed the deduplication key and cannot be altered safely.
  if (signingSecret && [action.type, action.id.toLowerCase(), config.boardId, cardId, listId, cardName, text, "trello"].some((value) => value?.includes(signingSecret))) throw invalid();
  return { kind: "accepted" as const, actionId: action.id.toLowerCase(), payload: { source: "trello", event: action.type, actionId: action.id.toLowerCase(), boardId: config.boardId, cardId, listId, cardName, text } };
}
