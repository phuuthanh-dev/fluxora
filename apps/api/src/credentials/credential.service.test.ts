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
