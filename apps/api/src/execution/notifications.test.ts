import assert from "node:assert/strict";
import test from "node:test";
import { CredentialProvider } from "@prisma/client";
import { executeDiscordWebhook, executeTelegramMessage, validateDiscordWebhookUrl } from "./execution.service";
import type { CredentialService } from "../credentials/credential.service";
import { isRetryableFailure } from "./retry-policy";

process.env.OUTBOUND_ALLOWED_HOSTNAMES = "discord.com,discordapp.com,api.telegram.org";

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
  assert.equal(result.output.content, "Hello Discord!");
  assert.equal(result.output.username, "BotUser");
  assert.equal(result.output.avatarUrl, "https://example.com/avatar.png");
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
    assert.equal(sentUrl, "https://discord.com/api/webhooks/12345/abcdef");
    assert.equal(sentMethod, "POST");
    assert.deepEqual(sentBody, {
      content: "Build completed successfully",
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

  // Invalid path
  assert.throws(
    () => validateDiscordWebhookUrl("https://discord.com/api/channels/12345/messages"),
    (err: any) => {
      assert.equal(err.code, "INVALID_CONFIGURATION");
      assert.equal(isRetryableFailure(err), false);
      assert.ok(!err.message.includes("channels"));
      return true;
    },
  );

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
  assert.equal(result.output.chatId, "-100123456");
  assert.equal(result.output.text, "Alert: CPU usage high");
  assert.equal(result.output.parseMode, "Markdown");
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
