import assert from "node:assert/strict";
import test from "node:test";
import { CredentialProvider } from "@prisma/client";
import { NodeFailure } from "./node-failure";
import { executeTelegramMessageOperation } from "./telegram-message-operations";

const config = { credentialId: "credential", destinationType: "supergroup", chatId: "-10012345", messageId: "42", messageThreadId: "7", text: "Hello", parseMode: "" };
const credentials = { readForExecution: async (id: string, workspaceId: string, provider: CredentialProvider) => {
  assert.equal(id, "credential"); assert.equal(workspaceId, "workspace"); assert.equal(provider, CredentialProvider.TELEGRAM_BOT);
  return { botToken: "123456:synthetic_token" };
} };

test("Telegram reply uses the selected credential, target message and topic", async () => {
  const result = await executeTelegramMessageOperation("reply", config, "live", "workspace", credentials as never, async (url, init) => {
    assert.ok(url.endsWith("/sendMessage"));
    assert.deepEqual(JSON.parse(String(init.body)), { chat_id: "-10012345", text: "Hello", reply_parameters: { message_id: 42, allow_sending_without_reply: false }, message_thread_id: 7 });
    return Response.json({ ok: true, result: { message_id: 43, chat: { id: -10012345 }, text: "ignored" } });
  });
  assert.equal(result.output.messageId, "43");
  assert.equal(result.output.destination, "-10012345");
  assert.ok(!JSON.stringify(result).includes("synthetic_token"));
});

test("Telegram edit confirms the exact message and uses no topic field", async () => {
  const input = { ...config, messageThreadId: "", parseMode: "HTML" };
  const result = await executeTelegramMessageOperation("edit", input, "live", "workspace", credentials as never, async (url, init) => {
    assert.ok(url.endsWith("/editMessageText"));
    assert.deepEqual(JSON.parse(String(init.body)), { chat_id: "-10012345", text: "Hello", parse_mode: "HTML", message_id: 42 });
    return Response.json({ ok: true, result: { message_id: 42, chat: { id: -10012345 } } });
  });
  assert.equal(result.output.messageId, "42");
  await assert.rejects(executeTelegramMessageOperation("edit", config, "mock", "workspace", credentials as never));
});

test("Telegram write ambiguity never retries or exposes provider details", async () => {
  for (const transport of [
    async () => { throw new Error("https://api.telegram.org/bot123456:synthetic_token/sendMessage"); },
    async () => new Response("provider secret", { status: 500 }),
    async () => Response.json({ ok: true, result: { message_id: 43, chat: { id: 123 } } }),
  ]) {
    await assert.rejects(executeTelegramMessageOperation("reply", config, "live", "workspace", credentials as never, transport), (error: unknown) => error instanceof NodeFailure && error.code === "DELIVERY_UNCERTAIN" && !error.retryable && !error.message.includes("synthetic_token") && !error.message.includes("provider secret"));
  }
});

test("Telegram rejects invalid IDs, text and destination before contacting provider", async () => {
  let calls = 0;
  const transport = async () => { calls++; return new Response(); };
  for (const patch of [{ messageId: "0" }, { chatId: "bad/name" }, { text: " " }, { parseMode: "unsupported" }]) {
    await assert.rejects(executeTelegramMessageOperation("reply", { ...config, ...patch }, "live", "workspace", credentials as never, transport));
  }
  assert.equal(calls, 0);
});
