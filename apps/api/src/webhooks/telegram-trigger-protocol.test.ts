import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { normalizeTelegramUpdate, readTelegramTriggerFilter, telegramTriggerFilterFromConfig, telegramWebhookSecretMatches } from "./telegram-trigger-protocol";

const filter = { events: ["message", "callback_query"], chatMode: "allowlist", allowedChatIds: ["-100123"] } as const;

test("Telegram webhook verifies a fixed-format header without exposing its secret", () => {
  const hash = createHash("sha256").update("synthetic_secret").digest("hex");
  assert.equal(telegramWebhookSecretMatches("synthetic_secret", hash), true);
  assert.equal(telegramWebhookSecretMatches("different", hash), false);
  assert.equal(telegramWebhookSecretMatches("synthetic_secret\n", hash), false);
  assert.equal(telegramWebhookSecretMatches("synthetic_secret", "bad"), false);
});

test("Telegram filter requires an explicit all-chats choice or a bounded allowlist", () => {
  assert.deepEqual(readTelegramTriggerFilter(filter), filter);
  assert.deepEqual(readTelegramTriggerFilter({ events: ["message"], chatMode: "all" }), { events: ["message"], chatMode: "all" });
  for (const value of [{ events: [], chatMode: "all" }, { events: ["message"], chatMode: "allowlist", allowedChatIds: [] }, { events: ["message"], chatMode: "all", allowedChatIds: ["123"] }, { events: ["message", "message"], chatMode: "all" }]) assert.throws(() => readTelegramTriggerFilter(value));
});

test("editor-friendly chat filters require an explicit choice and reject an empty allowlist", () => {
  assert.deepEqual(telegramTriggerFilterFromConfig({ event: "message", chatMode: "allowlist", allowedChatIds: "123, -100123" }), { events: ["message"], chatMode: "allowlist", allowedChatIds: ["123", "-100123"] });
  assert.equal(telegramTriggerFilterFromConfig({ event: "all", chatMode: "all" }).events.length, 3);
  assert.throws(() => telegramTriggerFilterFromConfig({ event: "message", chatMode: "allowlist", allowedChatIds: "" }));
});

test("Telegram message preserves only bounded fields and filters other chats", () => {
  const raw = { update_id: 42, message: { message_id: 8, chat: { id: -100123, title: "private title" }, from: { id: 987, username: "private username" }, text: "Hello", message_thread_id: 7, unknown: "private" } };
  const result = normalizeTelegramUpdate(raw, filter as never);
  assert.deepEqual(result, { kind: "accepted", updateId: 42, payload: { source: "telegram", event: "message", updateId: 42, message: { chatId: "-100123", messageId: 8, senderId: "987", threadId: 7, text: "Hello" } } });
  assert.deepEqual(normalizeTelegramUpdate({ ...raw, message: { ...raw.message, chat: { id: -999 } } }, filter as never), { kind: "ignored", updateId: 42 });
});

test("Telegram callback keeps its identity without assuming update IDs increase", () => {
  const callback = { callback_query: { id: "callback/opaque", from: { id: 987 }, message: { message_id: 8, chat: { id: -100123 } }, data: "approve" } };
  const newer = normalizeTelegramUpdate({ update_id: 100, ...callback }, filter as never);
  const lower = normalizeTelegramUpdate({ update_id: 2, ...callback }, filter as never);
  assert.equal(newer.kind, "accepted"); assert.equal(lower.kind, "accepted");
  assert.deepEqual(normalizeTelegramUpdate({ update_id: 3, callback_query: { id: "callback", inline_message_id: "inline" } }, filter as never), { kind: "ignored", updateId: 3 });
  assert.throws(() => normalizeTelegramUpdate({ update_id: 4, message: {}, callback_query: {} }, filter as never));
});
