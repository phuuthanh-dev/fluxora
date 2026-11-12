import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CredentialProvider } from "@prisma/client";
import type { PrismaService } from "../database/prisma.service";
import type { CredentialVaultService } from "./credential-vault.service";
import { airtableAccessToken, saveAirtableAuthorization } from "./airtable-oauth";

test("an uncertain Airtable token rotation is never replayed", async () => {
  const previous = { authType: "oauth", accessToken: "old-access", refreshToken: "old-refresh", airtableUserId: "usr12345678901234", expiresAt: 1 };
  let encrypted = JSON.stringify(previous);
  const vault = { encrypt: (value: object) => JSON.stringify(value), decrypt: (value: string) => JSON.parse(value) } as unknown as CredentialVaultService;
  const prisma = { credential: {
    findFirst: async ({ where }: { where: { workspaceId: string } }) => where.workspaceId === "owner" ? { id: "connection", workspaceId: "owner", provider: CredentialProvider.AIRTABLE, encryptedData: encrypted } : null,
    updateMany: async ({ where, data }: { where: { encryptedData: string }; data: { encryptedData: string } }) => { if (where.encryptedData !== encrypted) return { count: 0 }; encrypted = data.encryptedData; return { count: 1 }; },
  } } as unknown as PrismaService;
  const original = globalThis.fetch;
  const before = { id: process.env.AIRTABLE_CLIENT_ID, secret: process.env.AIRTABLE_CLIENT_SECRET, redirect: process.env.AIRTABLE_REDIRECT_URI };
  let requests = 0;
  process.env.AIRTABLE_CLIENT_ID = "test-client"; process.env.AIRTABLE_CLIENT_SECRET = "test-secret"; process.env.AIRTABLE_REDIRECT_URI = "http://localhost:3001/api/v1/oauth/airtable/callback";
  globalThis.fetch = (async () => { requests++; throw new Error("connection lost"); }) as typeof fetch;
  try {
    await assert.rejects(airtableAccessToken(prisma, vault, "other-workspace", "connection"));
    await assert.rejects(airtableAccessToken(prisma, vault, "owner", "connection"));
    await assert.rejects(airtableAccessToken(prisma, vault, "owner", "connection"));
    assert.equal(requests, 1);
    assert.equal(JSON.parse(encrypted).refreshPending, true);
    await assert.rejects(saveAirtableAuthorization(prisma, vault, "owner", "user", { ...previous, airtableUserId: "usrDIFFERENT12345", authType: "oauth" }, "connection"), /Reconnect the same Airtable account/);
  } finally {
    globalThis.fetch = original;
    for (const [name, value] of Object.entries({ AIRTABLE_CLIENT_ID: before.id, AIRTABLE_CLIENT_SECRET: before.secret, AIRTABLE_REDIRECT_URI: before.redirect })) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
