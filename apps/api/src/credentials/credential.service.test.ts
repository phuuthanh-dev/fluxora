import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaService } from "../database/prisma.service";
import { CredentialService } from "./credential.service";
import { CredentialProvider } from "@prisma/client";

test("credential list is owner-scoped and exposes only allowed masked hints", async () => {
  const secret = "fixture_trello_token_123456789xy";
  let required = "";
  const service = new CredentialService({ credential: { findMany: async () => [{ id: "c1", provider: CredentialProvider.TRELLO, label: "Trello", encryptedData: "ciphertext", createdAt: new Date(), updatedAt: new Date() }] } } as never,
    { requireOwner: async (workspaceId: string, userId: string) => { required = `${workspaceId}/${userId}`; } } as never,
    { decrypt: () => ({ token: secret }) } as never);
  const result = await service.list("ws", "owner");
  assert.equal(required, "ws/owner");
  assert.deepEqual(result[0]?.hints, [{ field: "token", label: "Token", masked: "••••••xy" }]);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(JSON.stringify(result).includes("ciphertext"), false);
});

test("credential hints are not loaded when workspace ownership fails", async () => {
  let reads = 0;
  const service = new CredentialService({ credential: { findMany: async () => { reads += 1; return []; } } } as never,
    { requireOwner: async () => { throw new Error("not owner"); } } as never,
    { decrypt: () => { throw new Error("must not decrypt"); } } as never);
  await assert.rejects(service.list("other-workspace", "user"), /not owner/);
  assert.equal(reads, 0);
});

test("expired Google OAuth credentials refresh on the server before execution", async () => {
  const updated: Array<{ encryptedData: string }> = [];
  const prisma = {
    credential: {
      findFirst: async () => ({ id: "credential-1", encryptedData: "encrypted" }),
      update: async ({ data }: { data: { encryptedData: string } }) => { updated.push(data); },
    },
  } as unknown as PrismaService;
  const vault = {
    decrypt: () => ({ accessToken: "old-token", refreshToken: "refresh-token", expiresAt: "2020-01-01T00:00:00.000Z" }),
    encrypt: (value: Record<string, unknown>) => JSON.stringify(value),
  } as never;
  const service = new CredentialService(prisma, {} as never, vault);
  const previousFetch = globalThis.fetch;
  const previousId = process.env.GOOGLE_CLIENT_ID;
  const previousSecret = process.env.GOOGLE_CLIENT_SECRET;
  process.env.GOOGLE_CLIENT_ID = "client-id";
  process.env.GOOGLE_CLIENT_SECRET = "client-secret";
  globalThis.fetch = async () => new Response(JSON.stringify({ access_token: "new-token", expires_in: 3600 }), { status: 200 });

  try {
    const credential = await service.readGoogleForExecution("credential-1", "workspace-1");
    assert.equal(credential.accessToken, "new-token");
    assert.equal(credential.refreshToken, "refresh-token");
    assert.equal(updated.length, 1);
    assert.match(updated[0]?.encryptedData ?? "", /new-token/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousId === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = previousId;
    if (previousSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET; else process.env.GOOGLE_CLIENT_SECRET = previousSecret;
  }
});

test("manual Google access tokens do not require OAuth client configuration", async () => {
  const prisma = {
    credential: {
      findFirst: async () => ({ id: "credential-1", encryptedData: "encrypted" }),
    },
  } as unknown as PrismaService;
  const vault = {
    decrypt: () => ({ accessToken: "manual-token" }),
  } as never;
  const service = new CredentialService(prisma, {} as never, vault);

  const credential = await service.readGoogleForExecution("credential-1", "workspace-1");
  assert.deepEqual(credential, { accessToken: "manual-token" });
});

type HttpErrorShape = {
  response?: {
    code?: string;
    message?: string;
    details?: {
      workflows?: Array<{ id: string; name: string }>;
      executions?: Array<{ id: string }>;
    };
  };
};

test("Gemini connection rejects empty or malformed keys before storage", async () => {
  const service = new CredentialService({} as never, { requireOwner: async () => {} } as never, {} as never);
  for (const apiKey of ["", "   ", "bad\nkey", "x".repeat(513)]) {
    await assert.rejects(service.create("ws-1", "user-1", { provider: "GEMINI", label: "Gemini", data: { apiKey } }), (error: unknown) => (error as HttpErrorShape).response?.code === "INVALID_INPUT");
  }
});

test("create rejects duplicate label with CREDENTIAL_LABEL_CONFLICT", async () => {
  const prisma = {
    credential: {
      findUnique: async () => ({ id: "existing-1", label: "Existing Label", provider: "DISCORD_WEBHOOK" }),
    },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const vault = { encrypt: (val: unknown) => JSON.stringify(val) } as never;
  const service = new CredentialService(prisma, workspaces, vault);

  await assert.rejects(
    async () => {
      await service.create("ws-1", "user-1", {
        provider: "DISCORD_WEBHOOK",
        label: "Existing Label",
        data: { webhookUrl: "https://discord.com/api/webhooks/1/abc" },
      });
    },
    (err: unknown) => {
      const error = err as HttpErrorShape;
      assert.equal(error.response?.code, "CREDENTIAL_LABEL_CONFLICT");
      assert.match(error.response?.message ?? "", /already exists/);
      return true;
    },
  );
});

test("create rejects canonical Google OAuth credential with CREDENTIAL_MANAGED_BY_OAUTH", async () => {
  const workspaces = { requireOwner: async () => {} } as never;
  const service = new CredentialService({} as never, workspaces, {} as never);

  await assert.rejects(
    async () => {
      await service.create("ws-1", "user-1", {
        provider: "GOOGLE",
        label: "Google OAuth",
        data: { accessToken: "manual" },
      });
    },
    (err: unknown) => {
      const error = err as HttpErrorShape;
      assert.equal(error.response?.code, "CREDENTIAL_MANAGED_BY_OAUTH");
      assert.match(error.response?.message ?? "", /Google sign-in/);
      return true;
    },
  );
});

test("create validates SMTP credentials before encrypting them", async () => {
  const workspaces = { requireOwner: async () => {} } as never;
  const service = new CredentialService({} as never, workspaces, {} as never);

  await assert.rejects(
    () => service.create("ws-1", "user-1", {
      provider: "SMTP",
      label: "Mailer",
      data: { host: "localhost", port: 25, username: "mailer", password: "smtp-secret", from: "alerts@example.com" },
    }),
    (err: unknown) => {
      const error = err as HttpErrorShape;
      assert.equal(error.response?.code, "INVALID_INPUT");
      assert.ok(!(error.response?.message ?? "").includes("smtp-secret"));
      return true;
    },
  );
});

test("Trello rejects invalid credentials before encryption without revealing them", async () => {
  const service = new CredentialService({} as never, { requireOwner: async () => {} } as never, {} as never);
  await assert.rejects(() => service.create("ws-1", "user-1", {
    provider: "TRELLO", label: "Trello", data: { apiKey: "valid-key", token: 'invalid"secret' },
  }), (err: unknown) => {
    const error = err as HttpErrorShape;
    assert.equal(error.response?.code, "INVALID_INPUT");
    assert.ok(!(error.response?.message ?? "").includes("secret"));
    return true;
  });
});

test("Sentry rejects invalid token or unsupported region before encryption", async () => {
  const service = new CredentialService({} as never, { requireOwner: async () => {} } as never, {} as never);
  for (const data of [{ token: "bad token", region: "us" }, { token: "fixture-token", region: "__proto__" }]) {
    await assert.rejects(() => service.create("ws-1", "user-1", { provider: "SENTRY", label: "Sentry", data }), (err: unknown) => {
      const error = err as HttpErrorShape; assert.equal(error.response?.code, "INVALID_INPUT"); return true;
    });
  }
});

test("Vercel rejects invalid token before encryption", async () => {
  const service = new CredentialService({} as never, { requireOwner: async () => {} } as never, {} as never);
  await assert.rejects(() => service.create("ws-1", "user-1", { provider: "VERCEL", label: "Vercel", data: { token: "bad token" } }), (err: unknown) => {
    const error = err as HttpErrorShape; assert.equal(error.response?.code, "INVALID_INPUT"); return true;
  });
});

test("Supabase rejects arbitrary hosts and malformed keys before encryption", async () => {
  const service = new CredentialService({} as never, { requireOwner: async () => {} } as never, {} as never);
  for (const data of [{ projectRef: "evil.example", apiKey: "fixture" }, { projectRef: "abcdefghijklmnopqrst", apiKey: "bad key" }]) {
    await assert.rejects(() => service.create("ws-1", "user-1", { provider: "SUPABASE", label: "Supabase", data }), (err: unknown) => {
      const error = err as HttpErrorShape; assert.equal(error.response?.code, "INVALID_INPUT"); return true;
    });
  }
});

test("create allows manual Google credentials including names that contain OAuth", async () => {
  const prisma = {
    credential: {
      findUnique: async () => null,
      create: async ({ data }: { data: { provider: string; label: string; encryptedData: string } }) => ({
        id: "cred-google-manual",
        provider: data.provider,
        label: data.label,
        createdAt: new Date("2026-10-25T00:00:00Z"),
        updatedAt: new Date("2026-10-25T00:00:00Z"),
      }),
    },
    auditLog: { create: async () => {} },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const vault = { encrypt: () => "enc" } as never;
  const service = new CredentialService(prisma, workspaces, vault);

  const summary = await service.create("ws-1", "user-1", {
    provider: "GOOGLE",
    label: "OAuth backup",
    data: { accessToken: "manual-token" },
  });

  assert.equal(summary.id, "cred-google-manual");
  assert.equal(summary.provider, "GOOGLE");
  assert.equal(summary.label, "OAuth backup");
  assert.equal(summary.isManaged, false);
});

test("create encrypts data, emits audit log without secret, and returns summary only", async () => {
  const auditLogs: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
  const createdRecords: Array<{ provider: string; label: string; encryptedData: string }> = [];
  const prisma = {
    credential: {
      findUnique: async () => null,
      create: async ({ data }: { data: { provider: string; label: string; encryptedData: string } }) => {
        createdRecords.push(data);
        return {
          id: "cred-new",
          provider: data.provider,
          label: data.label,
          createdAt: new Date("2026-10-25T00:00:00Z"),
          updatedAt: new Date("2026-10-25T00:00:00Z"),
        };
      },
    },
    auditLog: {
      create: async ({ data }: { data: { action: string; metadata?: Record<string, unknown> } }) => { auditLogs.push(data); },
    },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const vault = { encrypt: (val: unknown) => `encrypted:${JSON.stringify(val)}` } as never;
  const service = new CredentialService(prisma, workspaces, vault);

  const summary = await service.create("ws-1", "user-1", {
    provider: "DISCORD_WEBHOOK",
    label: "Ops Webhook",
    data: { webhookUrl: "https://discord.com/api/webhooks/1/supersecret" },
  });

  assert.equal(summary.id, "cred-new");
  assert.equal(summary.provider, "DISCORD_WEBHOOK");
  assert.equal(summary.label, "Ops Webhook");
  assert.equal("encryptedData" in summary, false);
  assert.equal("webhookUrl" in summary, false);

  assert.equal(createdRecords.length, 1);
  assert.equal(createdRecords[0]?.encryptedData, 'encrypted:{"webhookUrl":"https://discord.com/api/webhooks/1/supersecret"}');

  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0]?.action, "credential.created");
  assert.deepEqual(auditLogs[0]?.metadata, { provider: "DISCORD_WEBHOOK", label: "Ops Webhook" });
  assert.doesNotMatch(JSON.stringify(auditLogs[0]), /supersecret/);
});

test("update rejects canonical Google OAuth credential with CREDENTIAL_MANAGED_BY_OAUTH on rename and rotation", async () => {
  const existing = {
    id: "google-oauth-1",
    workspaceId: "ws-1",
    provider: "GOOGLE",
    label: "Google OAuth",
    encryptedData: "encrypted-oauth",
  };
  const prisma = {
    credential: {
      findFirst: async () => existing,
    },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const service = new CredentialService(prisma, workspaces, {} as never);

  // Reject rename
  await assert.rejects(
    async () => {
      await service.update("ws-1", "google-oauth-1", "user-1", { label: "My Google" });
    },
    (err: unknown) => {
      const error = err as HttpErrorShape;
      assert.equal(error.response?.code, "CREDENTIAL_MANAGED_BY_OAUTH");
      assert.match(error.response?.message ?? "", /managed through Google sign-in/);
      return true;
    },
  );

  // Reject secret rotation
  await assert.rejects(
    async () => {
      await service.update("ws-1", "google-oauth-1", "user-1", { data: { accessToken: "manual" } });
    },
    (err: unknown) => {
      const error = err as HttpErrorShape;
      assert.equal(error.response?.code, "CREDENTIAL_MANAGED_BY_OAUTH");
      return true;
    },
  );
});

test("update rejects renaming a manual Google credential to canonical Google OAuth with CREDENTIAL_MANAGED_BY_OAUTH", async () => {
  const existing = {
    id: "google-manual-1",
    workspaceId: "ws-1",
    provider: "GOOGLE",
    label: "OAuth backup",
    encryptedData: "encrypted-manual",
    createdAt: new Date("2026-10-25T00:00:00Z"),
    updatedAt: new Date("2026-10-25T00:00:00Z"),
  };
  const prisma = {
    credential: {
      findFirst: async () => existing,
    },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const service = new CredentialService(prisma, workspaces, {} as never);

  await assert.rejects(
    async () => {
      await service.update("ws-1", "google-manual-1", "user-1", { label: "Google OAuth" });
    },
    (err: unknown) => {
      const error = err as HttpErrorShape;
      assert.equal(error.response?.code, "CREDENTIAL_MANAGED_BY_OAUTH");
      assert.match(error.response?.message ?? "", /Google sign-in/);
      return true;
    },
  );
});

test("update allows renaming a manual Google credential to names that contain OAuth", async () => {
  const existing = {
    id: "google-manual-1",
    workspaceId: "ws-1",
    provider: "GOOGLE",
    label: "Original Google",
    encryptedData: "encrypted-manual",
    createdAt: new Date("2026-10-25T00:00:00Z"),
    updatedAt: new Date("2026-10-25T00:00:00Z"),
  };
  const prisma = {
    credential: {
      findFirst: async () => existing,
      findUnique: async () => null,
      update: async ({ data }: { data: { label?: string } }) => ({
        ...existing,
        label: data.label ?? existing.label,
      }),
    },
    auditLog: { create: async () => {} },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const service = new CredentialService(prisma, workspaces, {} as never);

  const updated = await service.update("ws-1", "google-manual-1", "user-1", { label: "OAuth backup" });
  assert.equal(updated.label, "OAuth backup");
  assert.equal(updated.isManaged, false);
});

test("delete rejects canonical Google OAuth credential with CREDENTIAL_MANAGED_BY_OAUTH", async () => {
  const existing = {
    id: "google-oauth-1",
    workspaceId: "ws-1",
    provider: "GOOGLE",
    label: "Google OAuth",
    encryptedData: "encrypted-oauth",
  };
  const prisma = {
    credential: {
      findFirst: async () => existing,
    },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const service = new CredentialService(prisma, workspaces, {} as never);

  await assert.rejects(
    async () => {
      await service.delete("ws-1", "google-oauth-1", "user-1");
    },
    (err: unknown) => {
      const error = err as HttpErrorShape;
      assert.equal(error.response?.code, "CREDENTIAL_MANAGED_BY_OAUTH");
      assert.match(error.response?.message ?? "", /managed through Google sign-in/);
      return true;
    },
  );
});

test("manual Google credentials can be updated and deleted normally", async () => {
  const updatedRecords: Array<{ label?: string }> = [];
  const deletedIds: string[] = [];
  const existing = {
    id: "google-manual-1",
    workspaceId: "ws-1",
    provider: "GOOGLE",
    label: "Manual Google Drive",
    encryptedData: "encrypted-manual",
    createdAt: new Date("2026-10-25T00:00:00Z"),
    updatedAt: new Date("2026-10-25T00:00:00Z"),
  };
  const prisma = {
    credential: {
      findFirst: async () => existing,
      findUnique: async () => null,
      update: async ({ data }: { data: { label?: string } }) => {
        updatedRecords.push(data);
        return { ...existing, label: data.label ?? existing.label };
      },
      delete: async ({ where }: { where: { id: string } }) => { deletedIds.push(where.id); },
    },
    workflow: { findMany: async () => [] },
    execution: { findMany: async () => [] },
    auditLog: { create: async () => {} },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const service = new CredentialService(prisma, workspaces, {} as never);

  const updated = await service.update("ws-1", "google-manual-1", "user-1", { label: "Renamed Manual Google" });
  assert.equal(updated.label, "Renamed Manual Google");

  const deleted = await service.delete("ws-1", "google-manual-1", "user-1");
  assert.deepEqual(deleted, { success: true, id: "google-manual-1" });
});

test("update renames credential while preserving ID and provider", async () => {
  const auditLogs: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
  const updatedRecords: Array<{ label?: string; encryptedData?: string }> = [];
  const existing = {
    id: "cred-1",
    workspaceId: "ws-1",
    provider: "HTTP",
    label: "Old Name",
    encryptedData: "old-encrypted",
    createdAt: new Date("2026-10-25T00:00:00Z"),
    updatedAt: new Date("2026-10-25T00:00:00Z"),
  };
  const prisma = {
    credential: {
      findFirst: async () => existing,
      findUnique: async () => null,
      update: async ({ data }: { data: { label?: string; encryptedData?: string } }) => {
        updatedRecords.push(data);
        return { ...existing, label: data.label ?? existing.label, updatedAt: new Date("2026-10-25T01:00:00Z") };
      },
    },
    auditLog: {
      create: async ({ data }: { data: { action: string; metadata?: Record<string, unknown> } }) => { auditLogs.push(data); },
    },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const vault = { encrypt: () => { throw new Error("Should not encrypt when only renaming"); } } as never;
  const service = new CredentialService(prisma, workspaces, vault);

  const summary = await service.update("ws-1", "cred-1", "user-1", { label: "New Name" });

  assert.equal(summary.id, "cred-1");
  assert.equal(summary.provider, "HTTP");
  assert.equal(summary.label, "New Name");
  assert.equal(updatedRecords[0]?.label, "New Name");
  assert.equal(updatedRecords[0]?.encryptedData, undefined);

  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0]?.action, "credential.renamed");
  assert.deepEqual(auditLogs[0]?.metadata, { provider: "HTTP", label: "New Name" });
});

test("update rejects duplicate label conflict on rename", async () => {
  const existing = {
    id: "cred-1",
    workspaceId: "ws-1",
    provider: "DISCORD_WEBHOOK",
    label: "Discord 1",
    encryptedData: "encrypted",
  };
  const prisma = {
    credential: {
      findFirst: async () => existing,
      findUnique: async () => ({ id: "cred-2", label: "Discord 2", provider: "DISCORD_WEBHOOK" }),
    },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const service = new CredentialService(prisma, workspaces, {} as never);

  await assert.rejects(
    async () => {
      await service.update("ws-1", "cred-1", "user-1", { label: "Discord 2" });
    },
    (err: unknown) => {
      const error = err as HttpErrorShape;
      assert.equal(error.response?.code, "CREDENTIAL_LABEL_CONFLICT");
      assert.match(error.response?.message ?? "", /already exists/);
      return true;
    },
  );
});

test("update rotates secret payload, encrypts data, and records redacted audit log", async () => {
  const auditLogs: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
  const updatedRecords: Array<{ label?: string; encryptedData?: string }> = [];
  const existing = {
    id: "cred-1",
    workspaceId: "ws-1",
    provider: "HTTP",
    label: "API Key",
    encryptedData: "old-encrypted",
    createdAt: new Date("2026-10-25T00:00:00Z"),
    updatedAt: new Date("2026-10-25T00:00:00Z"),
  };
  const prisma = {
    credential: {
      findFirst: async () => existing,
      update: async ({ data }: { data: { label?: string; encryptedData?: string } }) => {
        updatedRecords.push(data);
        return { ...existing, encryptedData: data.encryptedData ?? existing.encryptedData, updatedAt: new Date("2026-10-25T01:00:00Z") };
      },
    },
    auditLog: {
      create: async ({ data }: { data: { action: string; metadata?: Record<string, unknown> } }) => { auditLogs.push(data); },
    },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const vault = { encrypt: (val: unknown) => `new-encrypted:${JSON.stringify(val)}` } as never;
  const service = new CredentialService(prisma, workspaces, vault);

  const summary = await service.update("ws-1", "cred-1", "user-1", {
    data: { token: "secret-token-123" },
  });

  assert.equal(summary.id, "cred-1");
  assert.equal(summary.provider, "HTTP");
  assert.equal(summary.label, "API Key");
  assert.equal("encryptedData" in summary, false);
  assert.equal("token" in summary, false);

  assert.equal(updatedRecords.length, 1);
  assert.equal(updatedRecords[0]?.label, undefined);
  assert.equal(updatedRecords[0]?.encryptedData, 'new-encrypted:{"token":"secret-token-123"}');

  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0]?.action, "credential.rotated");
  assert.deepEqual(auditLogs[0]?.metadata, { provider: "HTTP", label: "API Key" });
  assert.doesNotMatch(JSON.stringify(auditLogs[0]), /secret-token-123/);
});

test("GitHub token rotation preserves a legacy webhook secret when omitted", async () => {
  let replacement: Record<string, unknown> | undefined;
  const existing = { id: "cred-1", workspaceId: "ws-1", provider: "GITHUB", label: "GitHub", encryptedData: "encrypted", createdAt: new Date(), updatedAt: new Date() };
  const prisma = { credential: { findFirst: async () => existing, update: async () => existing }, auditLog: { create: async () => undefined } } as unknown as PrismaService;
  const vault = { decrypt: () => ({ token: "old-token", webhookSecret: "legacy-secret" }), encrypt: (value: Record<string, unknown>) => { replacement = value; return "new-encrypted"; } } as never;
  const service = new CredentialService(prisma, { requireOwner: async () => undefined } as never, vault);
  await service.update("ws-1", "cred-1", "user-1", { data: { token: "new-token" } });
  assert.deepEqual(replacement, { token: "new-token", webhookSecret: "legacy-secret" });
});

test("update TELEGRAM_BOT preserves existing legacy chatId when replacement payload omits chatId", async () => {
  const updatedRecords: Array<{ encryptedData?: string }> = [];
  const existing = {
    id: "tg-legacy-1",
    workspaceId: "ws-1",
    provider: "TELEGRAM_BOT",
    label: "Legacy Telegram",
    encryptedData: "legacy-encrypted",
    createdAt: new Date("2026-10-25T00:00:00Z"),
    updatedAt: new Date("2026-10-25T00:00:00Z"),
  };
  const prisma = {
    credential: {
      findFirst: async () => existing,
      update: async ({ data }: { data: { encryptedData?: string } }) => {
        updatedRecords.push(data);
        return { ...existing, encryptedData: data.encryptedData ?? existing.encryptedData };
      },
    },
    auditLog: { create: async () => {} },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const vault = {
    decrypt: (val: string) => {
      if (val === "legacy-encrypted") return { botToken: "old-bot-token", chatId: "-100123456789" };
      return JSON.parse(val) as Record<string, unknown>;
    },
    encrypt: (val: Record<string, unknown>) => JSON.stringify(val),
  } as never;
  const service = new CredentialService(prisma, workspaces, vault);

  // Rotation payload omits chatId
  const summary = await service.update("ws-1", "tg-legacy-1", "user-1", {
    data: { botToken: "new-rotated-bot-token" },
  });

  assert.equal(summary.id, "tg-legacy-1");
  assert.equal("chatId" in summary, false);
  assert.equal("botToken" in summary, false);

  assert.equal(updatedRecords.length, 1);
  const parsedEncrypted = JSON.parse(updatedRecords[0]?.encryptedData ?? "{}") as Record<string, unknown>;
  assert.equal(parsedEncrypted.botToken, "new-rotated-bot-token");
  assert.equal(parsedEncrypted.chatId, "-100123456789");
});

test("update TELEGRAM_BOT keeps current vault-only credential vault-only when replacement omits chatId", async () => {
  const updatedRecords: Array<{ encryptedData?: string }> = [];
  const existing = {
    id: "tg-vault-only-1",
    workspaceId: "ws-1",
    provider: "TELEGRAM_BOT",
    label: "Modern Telegram",
    encryptedData: "modern-encrypted",
    createdAt: new Date("2026-10-25T00:00:00Z"),
    updatedAt: new Date("2026-10-25T00:00:00Z"),
  };
  const prisma = {
    credential: {
      findFirst: async () => existing,
      update: async ({ data }: { data: { encryptedData?: string } }) => {
        updatedRecords.push(data);
        return { ...existing, encryptedData: data.encryptedData ?? existing.encryptedData };
      },
    },
    auditLog: { create: async () => {} },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const vault = {
    decrypt: (val: string) => {
      if (val === "modern-encrypted") return { botToken: "old-bot-token" }; // No chatId
      return JSON.parse(val) as Record<string, unknown>;
    },
    encrypt: (val: Record<string, unknown>) => JSON.stringify(val),
  } as never;
  const service = new CredentialService(prisma, workspaces, vault);

  const summary = await service.update("ws-1", "tg-vault-only-1", "user-1", {
    data: { botToken: "new-token-only" },
  });

  assert.equal(summary.id, "tg-vault-only-1");
  assert.equal(updatedRecords.length, 1);
  const parsedEncrypted = JSON.parse(updatedRecords[0]?.encryptedData ?? "{}") as Record<string, unknown>;
  assert.equal(parsedEncrypted.botToken, "new-token-only");
  assert.equal("chatId" in parsedEncrypted, false);
});

test("update TELEGRAM_BOT overwrites legacy chatId if replacement payload explicitly provides chatId", async () => {
  const updatedRecords: Array<{ encryptedData?: string }> = [];
  const existing = {
    id: "tg-legacy-2",
    workspaceId: "ws-1",
    provider: "TELEGRAM_BOT",
    label: "Legacy Telegram",
    encryptedData: "legacy-encrypted-2",
    createdAt: new Date("2026-10-25T00:00:00Z"),
    updatedAt: new Date("2026-10-25T00:00:00Z"),
  };
  const prisma = {
    credential: {
      findFirst: async () => existing,
      update: async ({ data }: { data: { encryptedData?: string } }) => {
        updatedRecords.push(data);
        return { ...existing, encryptedData: data.encryptedData ?? existing.encryptedData };
      },
    },
    auditLog: { create: async () => {} },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const vault = {
    decrypt: (val: string) => {
      if (val === "legacy-encrypted-2") return { botToken: "old-token", chatId: "-100111" };
      return JSON.parse(val) as Record<string, unknown>;
    },
    encrypt: (val: Record<string, unknown>) => JSON.stringify(val),
  } as never;
  const service = new CredentialService(prisma, workspaces, vault);

  await service.update("ws-1", "tg-legacy-2", "user-1", {
    data: { botToken: "new-token", chatId: "-100222" },
  });

  assert.equal(updatedRecords.length, 1);
  const parsedEncrypted = JSON.parse(updatedRecords[0]?.encryptedData ?? "{}") as Record<string, unknown>;
  assert.equal(parsedEncrypted.botToken, "new-token");
  assert.equal(parsedEncrypted.chatId, "-100222");
});

test("delete blocks with CREDENTIAL_IN_USE when referenced by current draft version", async () => {
  const existing = { id: "cred-target", workspaceId: "ws-1", provider: "DISCORD_WEBHOOK", label: "Discord Target" };
  const prisma = {
    credential: {
      findFirst: async () => existing,
    },
    workflow: {
      findMany: async () => [
        {
          id: "wf-1",
          name: "Alert Workflow",
          draftVersion: {
            id: "ver-1",
            graph: {
              nodes: [
                { id: "node-1", type: "action.discord.webhook", config: { credentialId: "cred-target" } },
              ],
            },
          },
          publishedVersion: null,
        },
      ],
    },
    execution: {
      findMany: async () => [],
    },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const service = new CredentialService(prisma, workspaces, {} as never);

  await assert.rejects(
    async () => {
      await service.delete("ws-1", "cred-target", "user-1");
    },
    (err: unknown) => {
      const error = err as HttpErrorShape;
      assert.equal(error.response?.code, "CREDENTIAL_IN_USE");
      assert.deepEqual(error.response?.details?.workflows, [{ id: "wf-1", name: "Alert Workflow" }]);
      return true;
    },
  );
});

test("delete blocks with CREDENTIAL_IN_USE when referenced by notificationCredentialId in published version", async () => {
  const existing = { id: "cred-notif", workspaceId: "ws-1", provider: "GOOGLE_CHAT_WEBHOOK", label: "Chat Alerts" };
  const prisma = {
    credential: {
      findFirst: async () => existing,
    },
    workflow: {
      findMany: async () => [
        {
          id: "wf-approval",
          name: "Approval Flow",
          draftVersion: null,
          publishedVersion: {
            id: "ver-pub",
            graph: {
              nodes: [
                { id: "appr-1", type: "approval.request", config: { notificationCredentialId: "cred-notif" } },
              ],
            },
          },
        },
      ],
    },
    execution: {
      findMany: async () => [],
    },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const service = new CredentialService(prisma, workspaces, {} as never);

  await assert.rejects(
    async () => {
      await service.delete("ws-1", "cred-notif", "user-1");
    },
    (err: unknown) => {
      const error = err as HttpErrorShape;
      assert.equal(error.response?.code, "CREDENTIAL_IN_USE");
      assert.deepEqual(error.response?.details?.workflows, [{ id: "wf-approval", name: "Approval Flow" }]);
      return true;
    },
  );
});

test("delete blocks with CREDENTIAL_IN_USE when referenced by active execution", async () => {
  const existing = { id: "cred-active", workspaceId: "ws-1", provider: "HTTP", label: "HTTP Cred" };
  const prisma = {
    credential: {
      findFirst: async () => existing,
    },
    workflow: {
      findMany: async () => [],
    },
    execution: {
      findMany: async () => [
        {
          id: "exec-active-123",
          status: "RUNNING",
          workflowVersion: {
            id: "ver-old",
            graph: {
              nodes: [
                { id: "http-node", type: "action.http-request", config: { credentialId: "cred-active" } },
              ],
            },
            workflow: { id: "wf-1", name: "API Poller" },
          },
        },
      ],
    },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const service = new CredentialService(prisma, workspaces, {} as never);

  await assert.rejects(
    async () => {
      await service.delete("ws-1", "cred-active", "user-1");
    },
    (err: unknown) => {
      const error = err as HttpErrorShape;
      assert.equal(error.response?.code, "CREDENTIAL_IN_USE");
      assert.deepEqual(error.response?.details?.executions, [{ id: "exec-active-123" }]);
      return true;
    },
  );
});

test("references returns safe current workflow and active execution usage without graph or secret data", async () => {
  const existing = { id: "cred-refs", workspaceId: "ws-1", provider: "DISCORD_WEBHOOK", label: "Discord Alerts" };
  const createdAt = new Date("2026-10-27T12:00:00.000Z");
  const prisma = {
    credential: { findFirst: async () => existing },
    workflow: {
      findMany: async () => [
        {
          id: "wf-draft-published",
          name: "Daily Alerts",
          draftVersion: { graph: { nodes: [{ id: "draft-node", config: { credentialId: "cred-refs" } }] } },
          publishedVersion: { graph: { nodes: [{ id: "published-node", config: { credentialId: "cred-refs" } }] } },
        },
        {
          id: "wf-unrelated",
          name: "Unrelated",
          draftVersion: { graph: { nodes: [{ id: "other-node", config: { credentialId: "different" } }] } },
          publishedVersion: null,
        },
      ],
    },
    execution: {
      findMany: async () => [
        {
          id: "exec-running",
          status: "RUNNING",
          mode: "LIVE",
          createdAt,
          workflowVersion: {
            graph: { nodes: [{ id: "execution-node", config: { credentialId: "cred-refs" } }] },
          },
        },
      ],
    },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const service = new CredentialService(prisma, workspaces, {} as never);

  const references = await service.references("ws-1", "cred-refs", "user-1");

  assert.deepEqual(references.workflows, [{ id: "wf-draft-published", name: "Daily Alerts", locations: ["draft", "published"] }]);
  assert.deepEqual(references.executions, [{ id: "exec-running", status: "RUNNING", mode: "LIVE", createdAt }]);
  assert.equal("graph" in references, false);
  assert.equal(JSON.stringify(references).includes("credentialId"), false);
});

test("delete allows cleanup when credential is unreferenced or only in historic version with completed executions", async () => {
  const auditLogs: Array<{ action: string; metadata?: Record<string, unknown> }> = [];
  const deletedIds: string[] = [];
  const existing = { id: "cred-free", workspaceId: "ws-1", provider: "STEAM", label: "Steam Key" };
  const prisma = {
    credential: {
      findFirst: async () => existing,
      delete: async ({ where }: { where: { id: string } }) => { deletedIds.push(where.id); },
    },
    workflow: {
      findMany: async () => [
        {
          id: "wf-other",
          name: "Other Workflow",
          draftVersion: {
            id: "ver-draft",
            graph: { nodes: [{ id: "n1", type: "action.http-request", config: { credentialId: "different-cred" } }] },
          },
          publishedVersion: {
            id: "ver-pub",
            graph: { nodes: [{ id: "n1", type: "action.http-request", config: { credentialId: "different-cred" } }] },
          },
        },
      ],
    },
    execution: {
      findMany: async () => [], // No non-terminal executions
    },
    auditLog: {
      create: async ({ data }: { data: { action: string; metadata?: Record<string, unknown> } }) => { auditLogs.push(data); },
    },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const service = new CredentialService(prisma, workspaces, {} as never);

  const result = await service.delete("ws-1", "cred-free", "user-1");
  assert.deepEqual(result, { success: true, id: "cred-free" });
  assert.deepEqual(deletedIds, ["cred-free"]);
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0]?.action, "credential.deleted");
  assert.deepEqual(auditLogs[0]?.metadata, { provider: "STEAM", label: "Steam Key" });
});
