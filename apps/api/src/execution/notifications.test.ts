import assert from "node:assert/strict";
import test from "node:test";
import { CredentialProvider } from "@prisma/client";
import { executeDiscordWebhook, executeGoogleChatWebhook, executeTelegramMessage, validateDiscordWebhookUrl, ExecutionService } from "./execution.service";
import type { CredentialService } from "../credentials/credential.service";
import type { PrismaService } from "../database/prisma.service";
import type { ExecutionEventsService } from "./execution-events.service";
import { isRetryableFailure } from "./retry-policy";
import { redactValue } from "./redaction";
import {
  NotificationDispatcher,
  GoogleChatNotificationAdapter,
  DiscordNotificationAdapter,
  TelegramNotificationAdapter,
  HttpWebhookNotificationAdapter,
  sanitizeHttpDestination,
  defaultNotificationDispatcher,
} from "../notifications";

process.env.OUTBOUND_ALLOWED_HOSTNAMES = "discord.com,discordapp.com,api.telegram.org,chat.googleapis.com,example.com";

function createMockCredentials(store: Record<string, { provider: CredentialProvider; data: Record<string, unknown> }>): CredentialService {
  return {
    readForExecution: async (credentialId: string, _workspaceId: string, provider: CredentialProvider) => {
      const entry = store[credentialId];
      if (!entry || entry.provider !== provider) {
        const error = new Error("Credential not found");
        (error as any).code = "CREDENTIAL_NOT_FOUND";
        throw error;
      }
      return entry.data;
    },
  } as unknown as CredentialService;
}

test("Discord webhook: mock mode returns delivered payload without external calls", async () => {
  const credentials = createMockCredentials({});
  const result = await executeDiscordWebhook(
    { content: "Hello Discord!", username: "BotUser", avatarUrl: "https://example.com/avatar.png" },
    "mock",
    "workspace-1",
    credentials,
  );
  assert.equal(result.status, "succeeded");
  assert.equal(result.output.delivered, true);
  assert.equal(result.output.mode, "mock");
  assert.equal(result.output.provider, "discord");
  assert.equal(result.output.destination, "https://discord.com/api/webhooks/mock-id/[REDACTED]");
  assert.equal(result.output.messageId, "mock-discord-msg-id");
  assert.equal(typeof result.output.sentAt, "string");
});

test("Discord webhook: live mode forms outbound request and handles success", async () => {
  const credentials = createMockCredentials({
    "discord-cred": {
      provider: CredentialProvider.DISCORD_WEBHOOK,
      data: { webhookUrl: "https://discord.com/api/webhooks/12345/abcdef" },
    },
  });

  const originalFetch = globalThis.fetch;
  let sentUrl = "";
  let sentMethod = "";
  let sentBody: any = null;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    sentUrl = String(input);
    sentMethod = init?.method ?? "GET";
    sentBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  try {
    const result = await executeDiscordWebhook(
      {
        credentialId: "discord-cred",
        content: "Build completed successfully",
        username: "DeployBot",
        avatarUrl: "https://example.com/icon.png",
      },
      "live",
      "workspace-1",
      credentials,
    );

    assert.equal(result.status, "succeeded");
    assert.equal(result.output.delivered, true);
    assert.equal(result.output.mode, "live");
    assert.equal(result.output.provider, "discord");
    assert.equal(result.output.destination, "https://discord.com/api/webhooks/12345/[REDACTED]");
    assert.equal(typeof result.output.sentAt, "string");
    assert.equal(sentUrl, "https://discord.com/api/webhooks/12345/abcdef");
    assert.equal(sentMethod, "POST");
    assert.deepEqual(sentBody, {
      content: "Build completed successfully",
      allowed_mentions: { parse: [] },
      username: "DeployBot",
      avatar_url: "https://example.com/icon.png",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Discord webhook: validates empty content and missing credentials", async () => {
  const credentials = createMockCredentials({});

  await assert.rejects(
    () => executeDiscordWebhook({ credentialId: "missing", content: "" }, "live", "workspace-1", credentials),
    { message: "Discord message content is required." },
  );

  await assert.rejects(
    () => executeDiscordWebhook({ content: "Hello" }, "live", "workspace-1", credentials),
    { message: "Select a credential for this node." },
  );
});

test("Discord webhook: classifies 429 and 5xx as retryable, 400 as non-retryable", async () => {
  const credentials = createMockCredentials({
    "discord-cred": {
      provider: CredentialProvider.DISCORD_WEBHOOK,
      data: { webhookUrl: "https://discord.com/api/webhooks/12345/abcdef" },
    },
  });

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response("Rate limited", { status: 429 })) as typeof fetch;
    await assert.rejects(
      () => executeDiscordWebhook({ credentialId: "discord-cred", content: "hi" }, "live", "workspace-1", credentials),
      (err: any) => err.statusCode === 429 && isRetryableFailure(err) === true,
    );

    globalThis.fetch = (async () => new Response("Server error", { status: 500 })) as typeof fetch;
    await assert.rejects(
      () => executeDiscordWebhook({ credentialId: "discord-cred", content: "hi" }, "live", "workspace-1", credentials),
      (err: any) => err.statusCode === 500 && isRetryableFailure(err) === true,
    );

    globalThis.fetch = (async () => new Response("Bad request", { status: 400 })) as typeof fetch;
    await assert.rejects(
      () => executeDiscordWebhook({ credentialId: "discord-cred", content: "hi" }, "live", "workspace-1", credentials),
      (err: any) => err.statusCode === 400 && isRetryableFailure(err) === false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Discord webhook: validates HTTPS scheme, official hosts, and /api/webhooks/ path without leaking URL", async () => {
  // Valid official discord.com and legacy discordapp.com URLs pass validation
  assert.doesNotThrow(() => validateDiscordWebhookUrl("https://discord.com/api/webhooks/12345/abcdef"));
  assert.doesNotThrow(() => validateDiscordWebhookUrl("https://discordapp.com/api/webhooks/67890/ghijkl"));

  // Invalid HTTP scheme
  assert.throws(
    () => validateDiscordWebhookUrl("http://discord.com/api/webhooks/12345/abcdef"),
    (err: any) => {
      assert.equal(err.code, "INVALID_CONFIGURATION");
      assert.equal(isRetryableFailure(err), false);
      assert.ok(!err.message.includes("http://discord.com/api/webhooks/12345/abcdef"));
      return true;
    },
  );

  // Invalid host
  assert.throws(
    () => validateDiscordWebhookUrl("https://evil.example.com/api/webhooks/12345/abcdef"),
    (err: any) => {
      assert.equal(err.code, "INVALID_CONFIGURATION");
      assert.equal(isRetryableFailure(err), false);
      assert.ok(!err.message.includes("evil.example.com"));
      return true;
    },
  );

  // Rejected path shapes:
  const rejectedPaths = [
    { url: "https://discord.com/api/webhooks", desc: "missing both id and token" },
    { url: "https://discord.com/api/webhooks/", desc: "trailing slash after webhooks without id/token" },
    { url: "https://discord.com/api/webhooks/12345", desc: "missing token" },
    { url: "https://discord.com/api/webhooks/12345/", desc: "missing token with trailing slash" },
    { url: "https://discord.com/api/webhooks//abcdef", desc: "empty webhookId segment" },
    { url: "https://discord.com/api/webhooks/12345//", desc: "empty token segment" },
    { url: "https://discord.com/api/webhooks/12345/abcdef/", desc: "extra trailing slash" },
    { url: "https://discord.com/api/webhooks/12345/abcdef/extra", desc: "extra path segment" },
    { url: "https://discord.com/api/webhooks/12345/abcdef/github", desc: "extra github segment" },
    { url: "https://discord.com/api/channels/12345/messages", desc: "completely invalid path" },
  ];

  for (const { url, desc } of rejectedPaths) {
    assert.throws(
      () => validateDiscordWebhookUrl(url),
      (err: any) => {
        assert.equal(err.code, "INVALID_CONFIGURATION", `Expected INVALID_CONFIGURATION for ${desc}`);
        assert.equal(isRetryableFailure(err), false);
        assert.ok(!err.message.includes("12345"), `Error message must not leak ID for ${desc}`);
        assert.ok(!err.message.includes("abcdef"), `Error message must not leak token for ${desc}`);
        return true;
      },
    );
  }

  // Rejects invalid webhook URL inside executeDiscordWebhook without leaking the URL
  const secretWebhookUrl = "https://attacker-controlled.site/api/webhooks/secret-webhook-key";
  const credentials = createMockCredentials({
    "bad-discord-cred": {
      provider: CredentialProvider.DISCORD_WEBHOOK,
      data: { webhookUrl: secretWebhookUrl },
    },
  });

  await assert.rejects(
    () => executeDiscordWebhook({ credentialId: "bad-discord-cred", content: "hi" }, "live", "workspace-1", credentials),
    (err: any) => {
      assert.equal(err.code, "INVALID_CONFIGURATION");
      assert.equal(isRetryableFailure(err), false);
      assert.ok(!err.message.includes("attacker-controlled.site"));
      assert.ok(!err.message.includes("secret-webhook-key"));
      return true;
    },
  );
});

test("Discord webhook: classifies simulated TimeoutError as retryable TIMEOUT failure", async () => {
  const credentials = createMockCredentials({
    "discord-cred": {
      provider: CredentialProvider.DISCORD_WEBHOOK,
      data: { webhookUrl: "https://discord.com/api/webhooks/12345/abcdef" },
    },
  });

  const originalFetch = globalThis.fetch;
  const timeoutError = new Error("The operation was aborted due to timeout");
  timeoutError.name = "TimeoutError";
  globalThis.fetch = (async () => {
    throw timeoutError;
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => executeDiscordWebhook({ credentialId: "discord-cred", content: "hi" }, "live", "workspace-1", credentials),
      (err: any) => err.code === "TIMEOUT" && isRetryableFailure(err) === true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Discord webhook: classifies simulated network fetch failure as retryable NETWORK_ERROR failure", async () => {
  const credentials = createMockCredentials({
    "discord-cred": {
      provider: CredentialProvider.DISCORD_WEBHOOK,
      data: { webhookUrl: "https://discord.com/api/webhooks/12345/abcdef" },
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => executeDiscordWebhook({ credentialId: "discord-cred", content: "hi" }, "live", "workspace-1", credentials),
      (err: any) => err.code === "NETWORK_ERROR" && isRetryableFailure(err) === true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Telegram message: mock mode returns delivered payload without external calls", async () => {
  const credentials = createMockCredentials({});
  const result = await executeTelegramMessage(
    { chatId: "-100123456", text: "Alert: CPU usage high", parseMode: "Markdown" },
    "mock",
    "workspace-1",
    credentials,
  );
  assert.equal(result.status, "succeeded");
  assert.equal(result.output.delivered, true);
  assert.equal(result.output.mode, "mock");
  assert.equal(result.output.provider, "telegram");
  assert.equal(result.output.destination, "-100123456");
  assert.equal(result.output.messageId, "mock-telegram-msg-id");
  assert.equal(typeof result.output.sentAt, "string");
});

test("Telegram message: live mode forms outbound request to Telegram Bot API", async () => {
  const credentials = createMockCredentials({
    "tg-cred": {
      provider: CredentialProvider.TELEGRAM_BOT,
      data: { botToken: "123456:SECRET-TOKEN", chatId: "-10099999" },
    },
  });

  const originalFetch = globalThis.fetch;
  let sentUrl = "";
  let sentBody: any = null;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    sentUrl = String(input);
    sentBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await executeTelegramMessage(
      {
        credentialId: "tg-cred",
        text: "Deployment *v1.2.3* completed",
        parseMode: "Markdown",
      },
      "live",
      "workspace-1",
      credentials,
    );

    assert.equal(result.status, "succeeded");
    assert.equal(result.output.delivered, true);
    assert.equal(result.output.mode, "live");
    assert.equal(sentUrl, "https://api.telegram.org/bot123456:SECRET-TOKEN/sendMessage");
    assert.deepEqual(sentBody, {
      chat_id: "-10099999",
      text: "Deployment *v1.2.3* completed",
      parse_mode: "Markdown",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Telegram message: overrides chatId in node config if provided", async () => {
  const credentials = createMockCredentials({
    "tg-cred": {
      provider: CredentialProvider.TELEGRAM_BOT,
      data: { botToken: "123456:SECRET-TOKEN", chatId: "-10011111" },
    },
  });

  const originalFetch = globalThis.fetch;
  let sentBody: any = null;

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    sentBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    await executeTelegramMessage(
      { credentialId: "tg-cred", chatId: "-10022222", text: "Custom chat message" },
      "live",
      "workspace-1",
      credentials,
    );
    assert.equal(sentBody?.chat_id, "-10022222");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Telegram message: redacts bot token in error messages", async () => {
  const credentials = createMockCredentials({
    "tg-cred": {
      provider: CredentialProvider.TELEGRAM_BOT,
      data: { botToken: "987654:SUPER-SECRET-BOT-TOKEN", chatId: "12345" },
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    throw new Error(`Failed to fetch ${String(input)}`);
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => executeTelegramMessage({ credentialId: "tg-cred", text: "Hello" }, "live", "workspace-1", credentials),
      (err: any) => {
        assert.ok(!err.message.includes("987654:SUPER-SECRET-BOT-TOKEN"), "Error message must not contain the raw token");
        assert.ok(err.message.includes("[REDACTED]"), "Error message must contain [REDACTED]");
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Telegram message: classifies 429 and 5xx as retryable, 401 as non-retryable", async () => {
  const credentials = createMockCredentials({
    "tg-cred": {
      provider: CredentialProvider.TELEGRAM_BOT,
      data: { botToken: "123456:SECRET", chatId: "123" },
    },
  });

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response("Rate limited", { status: 429 })) as typeof fetch;
    await assert.rejects(
      () => executeTelegramMessage({ credentialId: "tg-cred", text: "hi" }, "live", "workspace-1", credentials),
      (err: any) => err.statusCode === 429 && isRetryableFailure(err) === true,
    );

    globalThis.fetch = (async () => new Response("Telegram server error", { status: 502 })) as typeof fetch;
    await assert.rejects(
      () => executeTelegramMessage({ credentialId: "tg-cred", text: "hi" }, "live", "workspace-1", credentials),
      (err: any) => err.statusCode === 502 && isRetryableFailure(err) === true,
    );

    globalThis.fetch = (async () => new Response("Unauthorized", { status: 401 })) as typeof fetch;
    await assert.rejects(
      () => executeTelegramMessage({ credentialId: "tg-cred", text: "hi" }, "live", "workspace-1", credentials),
      (err: any) => err.statusCode === 401 && isRetryableFailure(err) === false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Telegram message: classifies simulated TimeoutError as retryable TIMEOUT failure", async () => {
  const credentials = createMockCredentials({
    "tg-cred": {
      provider: CredentialProvider.TELEGRAM_BOT,
      data: { botToken: "123456:SECRET", chatId: "123" },
    },
  });

  const originalFetch = globalThis.fetch;
  const timeoutError = new Error("The operation was aborted due to timeout");
  timeoutError.name = "TimeoutError";
  globalThis.fetch = (async () => {
    throw timeoutError;
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => executeTelegramMessage({ credentialId: "tg-cred", text: "hi" }, "live", "workspace-1", credentials),
      (err: any) => err.code === "TIMEOUT" && isRetryableFailure(err) === true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Telegram message: classifies simulated network fetch failure as retryable NETWORK_ERROR failure", async () => {
  const credentials = createMockCredentials({
    "tg-cred": {
      provider: CredentialProvider.TELEGRAM_BOT,
      data: { botToken: "123456:SECRET", chatId: "123" },
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => executeTelegramMessage({ credentialId: "tg-cred", text: "hi" }, "live", "workspace-1", credentials),
      (err: any) => err.code === "NETWORK_ERROR" && isRetryableFailure(err) === true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Google Chat webhook: mock mode returns normalized delivery result", async () => {
  const credentials = createMockCredentials({});
  const result = await executeGoogleChatWebhook(
    { message: "Weekly summary report" },
    "mock",
    "workspace-1",
    credentials,
  );
  assert.equal(result.status, "succeeded");
  assert.equal(result.output.delivered, true);
  assert.equal(result.output.mode, "mock");
  assert.equal(result.output.provider, "google_chat");
  assert.equal(result.output.destination, "https://chat.googleapis.com/v1/spaces/mock-space/messages");
  assert.equal(result.output.messageId, "mock-google-chat-msg-id");
  assert.equal(typeof result.output.sentAt, "string");
});

test("Google Chat webhook: live mode forms request, strips query secrets from destination, and parses message name", async () => {
  const credentials = createMockCredentials({
    "gchat-cred": {
      provider: CredentialProvider.GOOGLE_CHAT_WEBHOOK,
      data: { webhookUrl: "https://chat.googleapis.com/v1/spaces/SPACE123/messages?key=SECRET_KEY&token=SECRET_TOKEN" },
    },
  });

  const originalFetch = globalThis.fetch;
  let sentUrl = "";
  let sentBody: any = null;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    sentUrl = String(input);
    sentBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ name: "spaces/SPACE123/messages/MSG456" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await executeGoogleChatWebhook(
      { credentialId: "gchat-cred", message: "Build passed!" },
      "live",
      "workspace-1",
      credentials,
    );

    assert.equal(result.status, "succeeded");
    assert.equal(result.output.delivered, true);
    assert.equal(result.output.mode, "live");
    assert.equal(result.output.provider, "google_chat");
    // Secrets in query params stripped from destination:
    assert.equal(result.output.destination, "https://chat.googleapis.com/v1/spaces/SPACE123/messages");
    assert.equal(result.output.messageId, "spaces/SPACE123/messages/MSG456");
    assert.equal(typeof result.output.sentAt, "string");
    assert.equal(sentUrl, "https://chat.googleapis.com/v1/spaces/SPACE123/messages?key=SECRET_KEY&token=SECRET_TOKEN");
    assert.deepEqual(sentBody, { text: "Build passed!" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Google Chat webhook: validates required message", async () => {
  const credentials = createMockCredentials({
    "gchat-cred": {
      provider: CredentialProvider.GOOGLE_CHAT_WEBHOOK,
      data: { webhookUrl: "https://chat.googleapis.com/v1/spaces/SPACE123/messages" },
    },
  });

  await assert.rejects(
    () => executeGoogleChatWebhook({ credentialId: "gchat-cred", message: "  " }, "live", "workspace-1", credentials),
    { message: "Google Chat message is required." },
  );
});

test("Discord webhook: supports embeds array and parses message ID from response", async () => {
  const credentials = createMockCredentials({
    "discord-cred": {
      provider: CredentialProvider.DISCORD_WEBHOOK,
      data: { webhookUrl: "https://discord.com/api/webhooks/777/tok777" },
    },
  });

  const originalFetch = globalThis.fetch;
  let sentBody: any = null;

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    sentBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ id: "9876543210" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const embeds = [{ title: "Deployment Alert", description: "All services healthy", color: 0x00ff00 }];
    const result = await executeDiscordWebhook(
      {
        credentialId: "discord-cred",
        content: "Notification with embed",
        embeds,
      },
      "live",
      "workspace-1",
      credentials,
    );

    assert.equal(result.status, "succeeded");
    assert.equal(result.output.delivered, true);
    assert.equal(result.output.destination, "https://discord.com/api/webhooks/777/[REDACTED]");
    assert.equal(result.output.messageId, "9876543210");
    assert.deepEqual(sentBody.embeds, embeds);
    assert.deepEqual(sentBody.allowed_mentions, { parse: [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Discord webhook: parses stringified JSON embeds and allows custom allowedMentions", async () => {
  const credentials = createMockCredentials({
    "discord-cred": {
      provider: CredentialProvider.DISCORD_WEBHOOK,
      data: { webhookUrl: "https://discord.com/api/webhooks/777/tok777" },
    },
  });

  const originalFetch = globalThis.fetch;
  let sentBody: any = null;

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    sentBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  try {
    const embedsString = JSON.stringify([{ title: "Stringified Embed" }]);
    await executeDiscordWebhook(
      {
        credentialId: "discord-cred",
        content: "Stringified embed test",
        embeds: embedsString,
        allowedMentions: { parse: ["users"] },
      },
      "live",
      "workspace-1",
      credentials,
    );

    assert.deepEqual(sentBody.embeds, [{ title: "Stringified Embed" }]);
    assert.deepEqual(sentBody.allowed_mentions, { parse: ["users"] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Discord webhook: rejects invalid embeds JSON", async () => {
  const credentials = createMockCredentials({
    "discord-cred": {
      provider: CredentialProvider.DISCORD_WEBHOOK,
      data: { webhookUrl: "https://discord.com/api/webhooks/777/tok777" },
    },
  });

  await assert.rejects(
    () => executeDiscordWebhook(
      { credentialId: "discord-cred", content: "Test", embeds: "not-json" },
      "live",
      "workspace-1",
      credentials,
    ),
    { message: "Discord embeds must be a JSON array." },
  );

  await assert.rejects(
    () => executeDiscordWebhook(
      { credentialId: "discord-cred", content: "Test", embeds: '{"title":"not-array"}' },
      "live",
      "workspace-1",
      credentials,
    ),
    { message: "Discord embeds must be a JSON array." },
  );
});

test("Telegram message: works with vault-only bot token and node config destination", async () => {
  const credentials = createMockCredentials({
    "vault-only-tg": {
      provider: CredentialProvider.TELEGRAM_BOT,
      data: { botToken: "555555:VAULT-TOKEN" }, // No chatId in credential
    },
  });

  const originalFetch = globalThis.fetch;
  let sentBody: any = null;

  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    sentBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ ok: true, result: { message_id: 888 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await executeTelegramMessage(
      {
        credentialId: "vault-only-tg",
        chatId: "-100777888",
        text: "Clean vault credential test",
      },
      "live",
      "workspace-1",
      credentials,
    );

    assert.equal(result.status, "succeeded");
    assert.equal(result.output.delivered, true);
    assert.equal(result.output.destination, "-100777888");
    assert.equal(result.output.messageId, "888");
    assert.equal(sentBody.chat_id, "-100777888");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Telegram message: fails if chatId is missing from both node config and credential", async () => {
  const credentials = createMockCredentials({
    "vault-only-tg": {
      provider: CredentialProvider.TELEGRAM_BOT,
      data: { botToken: "555555:VAULT-TOKEN" },
    },
  });

  await assert.rejects(
    () => executeTelegramMessage(
      { credentialId: "vault-only-tg", text: "Missing destination test" },
      "live",
      "workspace-1",
      credentials,
    ),
    { message: "Telegram chat ID is required in node configuration." },
  );
});

test("NotificationDispatcher: dispatches across registered adapters and rejects unknown providers", async () => {
  const dispatcher = new NotificationDispatcher([
    new GoogleChatNotificationAdapter(),
    new DiscordNotificationAdapter(),
    new TelegramNotificationAdapter(),
    new HttpWebhookNotificationAdapter(),
  ]);

  const mockChat = await dispatcher.dispatch({ provider: "google_chat", message: "Hi" }, undefined, "mock");
  assert.equal(mockChat.provider, "google_chat");
  assert.equal(mockChat.delivered, true);

  const mockDiscord = await dispatcher.dispatch({ provider: "discord", content: "Hi" }, undefined, "mock");
  assert.equal(mockDiscord.provider, "discord");
  assert.equal(mockDiscord.delivered, true);

  const mockTelegram = await dispatcher.dispatch({ provider: "telegram", text: "Hi", chatId: "123" }, undefined, "mock");
  assert.equal(mockTelegram.provider, "telegram");
  assert.equal(mockTelegram.destination, "123");

  const mockHttp = await dispatcher.dispatch({ provider: "http_webhook", message: "Hi" }, undefined, "mock");
  assert.equal(mockHttp.provider, "http_webhook");
  assert.equal(mockHttp.delivered, true);

  await assert.rejects(
    () => dispatcher.dispatch({ provider: "email" as any, message: "Hi" }, undefined, "mock"),
    { message: "No notification adapter registered for provider: email" },
  );
});

test("HttpWebhookNotificationAdapter: live mode applies authentication and delivers approval payload", async () => {
  const adapter = new HttpWebhookNotificationAdapter();
  const originalFetch = globalThis.fetch;
  let sentUrl = "";
  let sentHeaders: any = null;
  let sentBody: any = null;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    sentUrl = String(input);
    sentHeaders = init?.headers;
    sentBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await adapter.send(
      {
        provider: "http_webhook",
        message: "Approval needed for deploy #42",
        approvalUrl: "https://example.com/editor?approval=app-1",
      },
      {
        webhookUrl: "https://example.com/api/approvals",
        authType: "bearer",
        token: "SECRET_BEARER_TOKEN",
      },
      "live",
    );

    assert.equal(result.delivered, true);
    assert.equal(result.provider, "http_webhook");
    assert.equal(result.destination, "https://example.com/api/approvals");
    assert.equal(sentUrl, "https://example.com/api/approvals");
    assert.equal(sentHeaders?.Authorization, "Bearer SECRET_BEARER_TOKEN");
    assert.deepEqual(sentBody, {
      type: "workflow.approval.requested",
      message: "Approval needed for deploy #42",
      approvalUrl: "https://example.com/editor?approval=app-1",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Telegram message: treats HTTP 200 with ok: false as a failed delivery without exposing bot token or provider description", async () => {
  const credentials = createMockCredentials({
    "tg-cred": {
      provider: CredentialProvider.TELEGRAM_BOT,
      data: { botToken: "987654:SUPER_SECRET_TOKEN", chatId: "-1001111" },
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        ok: false,
        error_code: 400,
        description: "Bad Request: chat not found for token 987654:SUPER_SECRET_TOKEN",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => executeTelegramMessage({ credentialId: "tg-cred", text: "Hello" }, "live", "workspace-1", credentials),
      (err: any) => {
        assert.equal(err.code, "HTTP_ERROR");
        assert.equal(err.statusCode, 400);
        assert.equal(err.retryable, false);
        assert.equal(err.message, "Telegram returned 400.");
        assert.equal(err.message.includes("chat not found"), false);
        assert.equal(err.message.includes("987654:SUPER_SECRET_TOKEN"), false);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Telegram message: maps retryability from error_code on 200 ok: false responses", async () => {
  const credentials = createMockCredentials({
    "tg-cred": {
      provider: CredentialProvider.TELEGRAM_BOT,
      data: { botToken: "987654:TOKEN", chatId: "-1001111" },
    },
  });

  const originalFetch = globalThis.fetch;
  try {
    // 429 rate limit inside 200 ok: false
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({ ok: false, error_code: 429, description: "Too Many Requests" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    await assert.rejects(
      () => executeTelegramMessage({ credentialId: "tg-cred", text: "Rate limit test" }, "live", "workspace-1", credentials),
      (err: any) => err.statusCode === 429 && isRetryableFailure(err) === true,
    );

    // 502 bad gateway inside 200 ok: false
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({ ok: false, error_code: 502, description: "Bad Gateway" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    await assert.rejects(
      () => executeTelegramMessage({ credentialId: "tg-cred", text: "Gateway test" }, "live", "workspace-1", credentials),
      (err: any) => err.statusCode === 502 && isRetryableFailure(err) === true,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Telegram message: treats HTTP 200 with malformed JSON as a failed delivery", async () => {
  const credentials = createMockCredentials({
    "tg-cred": {
      provider: CredentialProvider.TELEGRAM_BOT,
      data: { botToken: "987654:TOKEN", chatId: "-1001111" },
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response("<html>Not a valid JSON response</html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => executeTelegramMessage({ credentialId: "tg-cred", text: "Malformed JSON test" }, "live", "workspace-1", credentials),
      (err: any) => {
        assert.equal(err.code, "HTTP_ERROR");
        assert.equal(err.statusCode, 200);
        assert.equal(err.retryable, false);
        assert.equal(err.message, "Telegram returned 200.");
        assert.equal(err.message.includes("987654:TOKEN"), false);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Telegram message: treats HTTP 200 with empty JSON object {} as a failed delivery", async () => {
  const credentials = createMockCredentials({
    "tg-cred": {
      provider: CredentialProvider.TELEGRAM_BOT,
      data: { botToken: "987654:TOKEN", chatId: "-1001111" },
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => executeTelegramMessage({ credentialId: "tg-cred", text: "Empty JSON test" }, "live", "workspace-1", credentials),
      (err: any) => {
        assert.equal(err.code, "HTTP_ERROR");
        assert.equal(err.statusCode, 200);
        assert.equal(err.retryable, false);
        assert.equal(err.message, "Telegram returned 200.");
        assert.equal(err.message.includes("987654:TOKEN"), false);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HttpWebhookNotificationAdapter: destination strips query parameters, credentials, fragments, and API keys while outbound request remains authenticated", async () => {
  const adapter = new HttpWebhookNotificationAdapter();
  const originalFetch = globalThis.fetch;
  let sentUrl = "";

  globalThis.fetch = (async (input: string | URL | Request) => {
    sentUrl = String(input);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await adapter.send(
      {
        provider: "http_webhook",
        message: "Approval needed for deploy #99",
        approvalUrl: "https://example.com/editor?approval=app-99",
      },
      {
        webhookUrl: "https://example.com/api/approval-listener?existingParam=123#fragSection",
        authType: "apiKey",
        location: "query",
        name: "secretKey",
        value: "SUPER_SECRET_QUERY_API_KEY",
      },
      "live",
    );

    assert.equal(result.delivered, true);
    assert.equal(result.provider, "http_webhook");

    // Outbound request MUST be authenticated with the query API key and preserved URL details:
    assert.equal(sentUrl.includes("secretKey=SUPER_SECRET_QUERY_API_KEY"), true);
    assert.equal(sentUrl.includes("existingParam=123"), true);

    // Result destination MUST NEVER contain username, password, query parameters, fragments, or API keys:
    assert.equal(result.destination, "https://example.com/api/approval-listener");
    assert.equal(result.destination.includes("secretKey"), false);
    assert.equal(result.destination.includes("SUPER_SECRET_QUERY_API_KEY"), false);
    assert.equal(result.destination.includes("existingParam"), false);
    assert.equal(result.destination.includes("fragSection"), false);

    // Persisted output sanitized via redactValue does not leak query key or token:
    const persisted = redactValue(result) as typeof result;
    assert.equal(JSON.stringify(persisted).includes("SUPER_SECRET_QUERY_API_KEY"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HttpWebhookNotificationAdapter: sanitizeHttpDestination handles invalid and unparseable URLs safely", () => {
  assert.equal(sanitizeHttpDestination("not-a-valid-url"), "http://[invalid-destination]");
  assert.equal(sanitizeHttpDestination(""), "http://[invalid-destination]");
  assert.equal(sanitizeHttpDestination(null as any), "http://[invalid-destination]");
  assert.equal(sanitizeHttpDestination(undefined as any), "http://[invalid-destination]");
  assert.equal(
    sanitizeHttpDestination("https://user:pass@example.com:8080/path/to/hook?token=secret#section"),
    "https://example.com:8080/path/to/hook",
  );
});

test("Approval notification: delegates through dispatcher and preserves Google Chat delivery", async () => {
  const credentials = createMockCredentials({
    "gchat-approval-cred": {
      provider: CredentialProvider.GOOGLE_CHAT_WEBHOOK,
      data: { webhookUrl: "https://chat.googleapis.com/v1/spaces/APPROVAL_SPACE/messages?key=KEY&token=TOK" },
    },
  });

  const prisma = {} as unknown as PrismaService;
  const events = {} as unknown as ExecutionEventsService;
  const executionService = new ExecutionService(prisma, credentials, events);

  const originalFetch = globalThis.fetch;
  let sentUrl = "";
  let sentBody: any = null;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    sentUrl = String(input);
    sentBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ name: "spaces/APPROVAL_SPACE/messages/MSG123" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const status = await executionService.notifyApproval(
      "workspace-1",
      "app-101",
      {
        message: "Staging deployment needs approval",
        notificationProvider: "google_chat",
        notificationCredentialId: "gchat-approval-cred",
      },
      "live",
    );

    assert.equal(status, "sent");
    assert.equal(sentUrl, "https://chat.googleapis.com/v1/spaces/APPROVAL_SPACE/messages?key=KEY&token=TOK");
    assert.deepEqual(sentBody, {
      text: "Staging deployment needs approval\n\nReview: http://localhost:3000/editor?approval=app-101",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Approval notification: delegates through dispatcher and preserves HTTP webhook delivery", async () => {
  const credentials = createMockCredentials({
    "http-approval-cred": {
      provider: CredentialProvider.HTTP,
      data: {
        webhookUrl: "https://example.com/api/approvals",
        authType: "bearer",
        token: "APPROVAL_BEARER_TOKEN",
      },
    },
  });

  const prisma = {} as unknown as PrismaService;
  const events = {} as unknown as ExecutionEventsService;
  const executionService = new ExecutionService(prisma, credentials, events);

  const originalFetch = globalThis.fetch;
  let sentUrl = "";
  let sentHeaders: any = null;
  let sentBody: any = null;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    sentUrl = String(input);
    sentHeaders = init?.headers;
    sentBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    const status = await executionService.notifyApproval(
      "workspace-1",
      "app-102",
      {
        message: "Production deployment release",
        notificationProvider: "http_webhook",
        notificationCredentialId: "http-approval-cred",
      },
      "live",
    );

    assert.equal(status, "sent");
    assert.equal(sentUrl, "https://example.com/api/approvals");
    assert.equal(sentHeaders?.Authorization, "Bearer APPROVAL_BEARER_TOKEN");
    assert.deepEqual(sentBody, {
      type: "workflow.approval.requested",
      message: "Production deployment release",
      approvalUrl: "http://localhost:3000/editor?approval=app-102",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Approval notification: preserves failed, mock_not_sent, and not_configured outcomes", async () => {
  const credentials = createMockCredentials({
    "failing-cred": {
      provider: CredentialProvider.HTTP,
      data: { webhookUrl: "https://example.com/api/failing" },
    },
  });

  const prisma = {} as unknown as PrismaService;
  const events = {} as unknown as ExecutionEventsService;
  const executionService = new ExecutionService(prisma, credentials, events);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return new Response("Server error", { status: 500 });
  }) as typeof fetch;

  try {
    // Delivery failure returns "failed"
    const failedStatus = await executionService.notifyApproval(
      "workspace-1",
      "app-103",
      {
        message: "Failing test",
        notificationProvider: "http_webhook",
        notificationCredentialId: "failing-cred",
      },
      "live",
    );
    assert.equal(failedStatus, "failed");

    // Mock mode returns "mock_not_sent"
    const mockStatus = await executionService.notifyApproval(
      "workspace-1",
      "app-104",
      {
        message: "Mock test",
        notificationProvider: "http_webhook",
        notificationCredentialId: "failing-cred",
      },
      "mock",
    );
    assert.equal(mockStatus, "mock_not_sent");

    // Missing credential returns "not_configured"
    const unconfiguredStatus = await executionService.notifyApproval(
      "workspace-1",
      "app-105",
      {
        message: "Unconfigured test",
        notificationProvider: "http_webhook",
      },
      "live",
    );
    assert.equal(unconfiguredStatus, "not_configured");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
