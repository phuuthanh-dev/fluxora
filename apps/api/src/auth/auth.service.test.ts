import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { AuthIdentityProvider } from "@prisma/client";
import type { PrismaService } from "../database/prisma.service";
import { AuthService } from "./auth.service";

test("register creates an owner workspace and stores only a hashed session token", async () => {
  const sessions: Array<{ tokenHash: string }> = [];
  const auditActions: string[] = [];
  const transaction = {
    user: {
      create: async () => ({ id: "user-1", email: "owner@example.com", displayName: "Owner" }),
    },
    workspace: {
      create: async () => ({ id: "workspace-1" }),
    },
    session: {
      create: async ({ data }: { data: { tokenHash: string } }) => sessions.push({ tokenHash: data.tokenHash }),
    },
    auditLog: { create: async ({ data }: { data: { action: string } }) => { auditActions.push(data.action); } },
  };
  const prisma = {
    user: { findUnique: async () => null },
    $transaction: async <T>(callback: (client: typeof transaction) => Promise<T>) => callback(transaction),
  } as unknown as PrismaService;

  const result = await new AuthService(prisma).register({
    email: "OWNER@EXAMPLE.COM",
    password: "a-long-enough-password",
    displayName: "Owner",
  });

  assert.deepEqual(result.user, { id: "user-1", email: "owner@example.com", displayName: "Owner" });
  assert.equal(sessions.length, 1);
  assert.notEqual(sessions[0]?.tokenHash, result.token);
  assert.deepEqual(auditActions, ["auth.registered"]);
});

test("login does not reveal whether an email exists", async () => {
  const prisma = {
    user: { findUnique: async () => null },
  } as unknown as PrismaService;

  await assert.rejects(
    () => new AuthService(prisma).login({ email: "missing@example.com", password: "wrong-password" }),
    UnauthorizedException,
  );
});

test("Google identity registration creates an owner workspace without a password", async () => {
  const sessions: Array<{ userId: string; tokenHash: string }> = [];
  const identities: Array<{ userId: string; provider: AuthIdentityProvider; providerAccountId: string; email: string }> = [];
  const auditActions: string[] = [];
  const transaction = {
    authIdentity: {
      findUnique: async () => null,
      create: async ({ data }: { data: { userId: string; provider: AuthIdentityProvider; providerAccountId: string; email: string } }) => identities.push(data),
      update: async () => undefined,
    },
    user: {
      findUnique: async () => null,
      create: async () => ({ id: "google-user-1", email: "owner@example.com", passwordHash: null, displayName: "Google Owner" }),
    },
    workspace: { create: async () => ({ id: "workspace-1" }) },
    session: { create: async ({ data }: { data: { userId: string; tokenHash: string } }) => sessions.push(data) },
    auditLog: { create: async ({ data }: { data: { action: string } }) => { auditActions.push(data.action); } },
  };
  const prisma = { $transaction: async <T>(callback: (client: typeof transaction) => Promise<T>) => callback(transaction) } as unknown as PrismaService;

  const result = await new AuthService(prisma).loginWithIdentity({
    provider: AuthIdentityProvider.GOOGLE,
    providerAccountId: "google-subject-1",
    email: "OWNER@EXAMPLE.COM",
    displayName: "Google Owner",
  });

  assert.deepEqual(result.user, { id: "google-user-1", email: "owner@example.com", displayName: "Google Owner" });
  assert.equal(identities.length, 1);
  assert.deepEqual(identities[0], { userId: "google-user-1", provider: AuthIdentityProvider.GOOGLE, providerAccountId: "google-subject-1", email: "owner@example.com" });
  assert.equal(sessions[0]?.userId, "google-user-1");
  assert.notEqual(sessions[0]?.tokenHash, result.token);
  assert.deepEqual(auditActions, ["auth.identity_registered"]);
});

test("password login rejects a passwordless identity account", async () => {
  const prisma = {
    user: { findUnique: async () => ({ id: "user-1", email: "owner@example.com", passwordHash: null }) },
  } as unknown as PrismaService;

  await assert.rejects(
    () => new AuthService(prisma).login({ email: "owner@example.com", password: "anything" }),
    UnauthorizedException,
  );
});

test("Steam identity links only to the current signed-in user", async () => {
  const auditActions: string[] = [];
  const transaction = {
    authIdentity: {
      findUnique: async () => null,
      create: async () => ({ id: "steam-identity-1", provider: AuthIdentityProvider.STEAM, providerAccountId: "76561198000000000", updatedAt: new Date("2026-10-24T00:00:00.000Z") }),
    },
    auditLog: { create: async ({ data }: { data: { action: string } }) => { auditActions.push(data.action); } },
  };
  const prisma = { $transaction: async <T>(callback: (client: typeof transaction) => Promise<T>) => callback(transaction) } as unknown as PrismaService;

  const result = await new AuthService(prisma).linkIdentity("owner-1", AuthIdentityProvider.STEAM, "76561198000000000");

  assert.equal(result.provider, AuthIdentityProvider.STEAM);
  assert.equal(result.providerAccountId, "76561198000000000");
  assert.deepEqual(auditActions, ["auth.identity_linked"]);
});

test("an identity-only account cannot unlink its only Google or GitHub sign-in method", async () => {
  const transaction = {
    user: { findUnique: async () => ({ id: "user-1", passwordHash: null, identities: [{ provider: AuthIdentityProvider.GITHUB }] }) },
    authIdentity: { findFirst: async () => ({ id: "identity-1" }) },
    auditLog: { create: async () => undefined },
  };
  const prisma = { $transaction: async <T>(callback: (client: typeof transaction) => Promise<T>) => callback(transaction) } as unknown as PrismaService;

  await assert.rejects(() => new AuthService(prisma).unlinkIdentity("user-1", AuthIdentityProvider.GITHUB), BadRequestException);
});

test("a password account can unlink a social identity and records an audit event", async () => {
  const actions: string[] = [];
  const transaction = {
    user: { findUnique: async () => ({ id: "user-1", passwordHash: "hash", identities: [{ provider: AuthIdentityProvider.GITHUB }] }) },
    authIdentity: { findFirst: async () => ({ id: "identity-1" }), delete: async () => undefined },
    auditLog: { create: async ({ data }: { data: { action: string } }) => { actions.push(data.action); } },
  };
  const prisma = {
    $transaction: async <T>(callback: (client: typeof transaction) => Promise<T>) => callback(transaction),
    authIdentity: { findMany: async () => [] },
  } as unknown as PrismaService;

  const identities = await new AuthService(prisma).unlinkIdentity("user-1", AuthIdentityProvider.GITHUB);
  assert.deepEqual(identities, []);
  assert.deepEqual(actions, ["auth.identity_unlinked"]);
});
