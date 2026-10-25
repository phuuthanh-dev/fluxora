import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaService } from "../database/prisma.service";
import { CredentialService } from "./credential.service";

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
    (err: any) => {
      assert.equal(err.response?.code, "CREDENTIAL_LABEL_CONFLICT");
      assert.match(err.response?.message, /already exists/);
      return true;
    },
  );
});

test("create encrypts data, emits audit log without secret, and returns summary only", async () => {
  const auditLogs: any[] = [];
  const createdRecords: any[] = [];
  const prisma = {
    credential: {
      findUnique: async () => null,
      create: async ({ data }: any) => {
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
      create: async ({ data }: any) => { auditLogs.push(data); },
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
  assert.equal((summary as any).encryptedData, undefined);
  assert.equal((summary as any).webhookUrl, undefined);

  assert.equal(createdRecords.length, 1);
  assert.equal(createdRecords[0].encryptedData, 'encrypted:{"webhookUrl":"https://discord.com/api/webhooks/1/supersecret"}');

  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].action, "credential.created");
  assert.deepEqual(auditLogs[0].metadata, { provider: "DISCORD_WEBHOOK", label: "Ops Webhook" });
  assert.doesNotMatch(JSON.stringify(auditLogs[0]), /supersecret/);
});

test("update renames credential while preserving ID and provider", async () => {
  const auditLogs: any[] = [];
  const updatedRecords: any[] = [];
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
      update: async ({ data }: any) => {
        updatedRecords.push(data);
        return { ...existing, label: data.label, updatedAt: new Date("2026-10-25T01:00:00Z") };
      },
    },
    auditLog: {
      create: async ({ data }: any) => { auditLogs.push(data); },
    },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const vault = { encrypt: () => { throw new Error("Should not encrypt when only renaming"); } } as never;
  const service = new CredentialService(prisma, workspaces, vault);

  const summary = await service.update("ws-1", "cred-1", "user-1", { label: "New Name" });

  assert.equal(summary.id, "cred-1");
  assert.equal(summary.provider, "HTTP");
  assert.equal(summary.label, "New Name");
  assert.equal(updatedRecords[0].label, "New Name");
  assert.equal(updatedRecords[0].encryptedData, undefined);

  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].action, "credential.renamed");
  assert.deepEqual(auditLogs[0].metadata, { provider: "HTTP", label: "New Name" });
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
    (err: any) => {
      assert.equal(err.response?.code, "CREDENTIAL_LABEL_CONFLICT");
      assert.match(err.response?.message, /already exists/);
      return true;
    },
  );
});

test("update rotates secret payload, encrypts data, and records redacted audit log", async () => {
  const auditLogs: any[] = [];
  const updatedRecords: any[] = [];
  const existing = {
    id: "cred-1",
    workspaceId: "ws-1",
    provider: "TELEGRAM_BOT",
    label: "Telegram Bot",
    encryptedData: "old-encrypted",
    createdAt: new Date("2026-10-25T00:00:00Z"),
    updatedAt: new Date("2026-10-25T00:00:00Z"),
  };
  const prisma = {
    credential: {
      findFirst: async () => existing,
      update: async ({ data }: any) => {
        updatedRecords.push(data);
        return { ...existing, encryptedData: data.encryptedData, updatedAt: new Date("2026-10-25T01:00:00Z") };
      },
    },
    auditLog: {
      create: async ({ data }: any) => { auditLogs.push(data); },
    },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const vault = { encrypt: (val: unknown) => `new-encrypted:${JSON.stringify(val)}` } as never;
  const service = new CredentialService(prisma, workspaces, vault);

  const summary = await service.update("ws-1", "cred-1", "user-1", {
    data: { botToken: "999:rotated-token-secret" },
  });

  assert.equal(summary.id, "cred-1");
  assert.equal(summary.provider, "TELEGRAM_BOT");
  assert.equal(summary.label, "Telegram Bot");
  assert.equal((summary as any).encryptedData, undefined);
  assert.equal((summary as any).botToken, undefined);

  assert.equal(updatedRecords.length, 1);
  assert.equal(updatedRecords[0].label, undefined);
  assert.equal(updatedRecords[0].encryptedData, 'new-encrypted:{"botToken":"999:rotated-token-secret"}');

  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].action, "credential.rotated");
  assert.deepEqual(auditLogs[0].metadata, { provider: "TELEGRAM_BOT", label: "Telegram Bot" });
  assert.doesNotMatch(JSON.stringify(auditLogs[0]), /rotated-token-secret/);
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
    (err: any) => {
      assert.equal(err.response?.code, "CREDENTIAL_IN_USE");
      assert.deepEqual(err.response?.details?.workflows, [{ id: "wf-1", name: "Alert Workflow" }]);
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
    (err: any) => {
      assert.equal(err.response?.code, "CREDENTIAL_IN_USE");
      assert.deepEqual(err.response?.details?.workflows, [{ id: "wf-approval", name: "Approval Flow" }]);
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
    (err: any) => {
      assert.equal(err.response?.code, "CREDENTIAL_IN_USE");
      assert.deepEqual(err.response?.details?.executions, [{ id: "exec-active-123" }]);
      return true;
    },
  );
});

test("delete allows cleanup when credential is unreferenced or only in historic version with completed executions", async () => {
  const auditLogs: any[] = [];
  const deletedIds: string[] = [];
  const existing = { id: "cred-free", workspaceId: "ws-1", provider: "STEAM", label: "Steam Key" };
  const prisma = {
    credential: {
      findFirst: async () => existing,
      delete: async ({ where }: any) => { deletedIds.push(where.id); },
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
      create: async ({ data }: any) => { auditLogs.push(data); },
    },
  } as unknown as PrismaService;
  const workspaces = { requireOwner: async () => {} } as never;
  const service = new CredentialService(prisma, workspaces, {} as never);

  const result = await service.delete("ws-1", "cred-free", "user-1");
  assert.deepEqual(result, { success: true, id: "cred-free" });
  assert.deepEqual(deletedIds, ["cred-free"]);
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].action, "credential.deleted");
  assert.deepEqual(auditLogs[0].metadata, { provider: "STEAM", label: "Steam Key" });
});
