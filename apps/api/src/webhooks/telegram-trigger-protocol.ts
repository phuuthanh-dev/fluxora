import { createHash, timingSafeEqual } from "node:crypto";
import { BadRequestException } from "@nestjs/common";

export type TelegramUpdateKind = "message" | "channel_post" | "callback_query";
export type TelegramTriggerFilter = { events: TelegramUpdateKind[]; chatMode: "all" | "allowlist"; allowedChatIds?: string[] };
const supportedEvents: readonly TelegramUpdateKind[] = ["message", "channel_post", "callback_query"];
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const invalid = () => new BadRequestException({ code: "TELEGRAM_UPDATE_INVALID", message: "Telegram update is invalid." });
const invalidFilter = () => new BadRequestException({ code: "TELEGRAM_FILTER_INVALID", message: "Choose supported Telegram events and a valid chat filter." });

function chatId(value: unknown): string | undefined {
  const text = typeof value === "string" ? value : typeof value === "number" && Number.isSafeInteger(value) ? String(value) : "";
  return /^-?[1-9]\d{0,15}$/.test(text) && Number.isSafeInteger(Number(text)) ? text : undefined;
}

/** The secret itself is never stored in this representation or returned. */
export function telegramWebhookSecretMatches(received: unknown, expectedHash: unknown) {
  if (typeof received !== "string" || !/^[A-Za-z0-9_-]{1,256}$/.test(received) || typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  return timingSafeEqual(createHash("sha256").update(received).digest(), Buffer.from(expectedHash, "hex"));
}

export function readTelegramTriggerFilter(value: unknown): TelegramTriggerFilter {
  const input = object(value);
  if (!input || Object.keys(input).some((key) => !["events", "chatMode", "allowedChatIds"].includes(key)) || !Array.isArray(input.events) || !input.events.length || input.events.length > supportedEvents.length || input.events.some((item) => typeof item !== "string" || !supportedEvents.includes(item as TelegramUpdateKind)) || new Set(input.events).size !== input.events.length || (input.chatMode !== "all" && input.chatMode !== "allowlist")) throw invalidFilter();
  const ids = input.allowedChatIds;
  if (input.chatMode === "all") {
    if (ids !== undefined && (!Array.isArray(ids) || ids.length !== 0)) throw invalidFilter();
    return { events: input.events as TelegramUpdateKind[], chatMode: "all" };
  }
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some((id) => typeof id !== "string" || chatId(id) !== id) || new Set(ids).size !== ids.length) throw invalidFilter();
  return { events: input.events as TelegramUpdateKind[], chatMode: "allowlist", allowedChatIds: ids as string[] };
}

/** Convert editor-friendly single-event and comma-separated inputs to the
 * explicit protocol filter; empty allowlists are rejected rather than broad. */
export function telegramTriggerFilterFromConfig(config: Record<string, unknown>): TelegramTriggerFilter {
  const event = config.event;
  const chatMode = config.chatMode;
  if (!["all", ...supportedEvents].includes(String(event)) || (chatMode !== "all" && chatMode !== "allowlist")) throw invalidFilter();
  const events = event === "all" ? [...supportedEvents] : [event as TelegramUpdateKind];
  if (chatMode === "all") return readTelegramTriggerFilter({ events, chatMode });
  if (typeof config.allowedChatIds !== "string") throw invalidFilter();
  return readTelegramTriggerFilter({ events, chatMode, allowedChatIds: config.allowedChatIds.split(",").map((id) => id.trim()) });
}

/** Parse only the supported subset. Unsupported and non-matching updates are
 * acknowledged as ignored, while malformed supported updates fail closed. */
export function normalizeTelegramUpdate(value: unknown, filter: TelegramTriggerFilter) {
  const policy = readTelegramTriggerFilter(filter);
  const update = object(value);
  if (!update || typeof update.update_id !== "number" || !Number.isSafeInteger(update.update_id) || update.update_id < 0) throw invalid();
  const present = supportedEvents.filter((kind) => update[kind] !== undefined);
  if (present.length > 1) throw invalid();
  if (!present.length || !policy.events.includes(present[0]!)) return { kind: "ignored" as const, updateId: update.update_id };
  const kind = present[0]!;
  const event = object(update[kind]);
  if (!event) throw invalid();
  const message = kind === "callback_query" ? object(event.message) : event;
  // Inline callback queries have no chat; this connector cannot apply the
  // chat policy to them, so it acknowledges without executing a workflow.
  if (kind === "callback_query" && !message && typeof event.inline_message_id === "string") return { kind: "ignored" as const, updateId: update.update_id };
  const chat = object(message?.chat);
  const destination = chatId(chat?.id);
  if (!message || !destination) throw invalid();
  if (policy.chatMode === "allowlist" && !policy.allowedChatIds!.includes(destination)) return { kind: "ignored" as const, updateId: update.update_id };
  if (typeof message.message_id !== "number" || !Number.isSafeInteger(message.message_id) || message.message_id < 0) throw invalid();
  const sender = object(kind === "callback_query" ? event.from : message.from);
  const senderId = sender?.id === undefined ? null : chatId(sender.id);
  if (sender?.id !== undefined && (!senderId || senderId.startsWith("-"))) throw invalid();
  if (message.message_thread_id !== undefined && (typeof message.message_thread_id !== "number" || !Number.isSafeInteger(message.message_thread_id) || message.message_thread_id < 1)) throw invalid();
  const text = message.text ?? message.caption ?? null;
  if (text !== null && (typeof text !== "string" || text.length > 4096)) throw invalid();
  const common = { chatId: destination, messageId: message.message_id, senderId, threadId: message.message_thread_id ?? null, text };
  if (kind === "callback_query") {
    if (typeof event.id !== "string" || !/^[^\u0000-\u001f\u007f-\u009f]{1,256}$/.test(event.id) || (event.data !== undefined && (typeof event.data !== "string" || event.data.length > 1024))) throw invalid();
    return { kind: "accepted" as const, updateId: update.update_id, payload: { source: "telegram", event: kind, updateId: update.update_id, message: common, callback: { id: event.id, data: event.data ?? null } } };
  }
  return { kind: "accepted" as const, updateId: update.update_id, payload: { source: "telegram", event: kind, updateId: update.update_id, message: common } };
}
