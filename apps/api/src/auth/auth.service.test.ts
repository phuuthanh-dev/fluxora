import assert from "node:assert/strict";
import test from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import type { PrismaService } from "../database/prisma.service";
import { AuthService } from "./auth.service";

test("register creates an owner workspace and stores only a hashed session token", async () => {
  const sessions: Array<{ tokenHash: string }> = [];
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
