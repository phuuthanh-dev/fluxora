import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { AdminController } from "./admin.controller";
import { AuthService } from "../auth/auth.service";

test("administration disables and restores sign-in while retaining the user's workspace", { skip: process.env.FLUXORA_CREDENTIAL_INTEGRATION !== "1" }, async () => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(database.pathname) || !["localhost", "127.0.0.1"].includes(database.hostname)) throw new Error("Admin integration requires an isolated local test database.");
  const db = new PrismaClient(); const suffix = randomUUID();
  const auth = new AuthService(db as never);
  const admin = await db.user.create({ data: { email: `admin-${suffix}@example.test` } });
  let userId = ""; let workspaceId = "";
  try {
    const email = `account-${suffix}@example.test`; const password = "synthetic-long-password";
    const account = await auth.register({ email, password, displayName: "Test account" });
    userId = account.user.id;
    workspaceId = (await db.workspace.findFirstOrThrow({ where: { ownerId: userId }, select: { id: true } })).id;
    const controller = new AdminController(db as never, {} as never, {} as never);
    const request = { currentUser: { id: admin.id } } as never;
    await controller.setAccountState(userId, "disable", request);
    await assert.rejects(auth.getCurrentUser(account.token));
    await assert.rejects(auth.login({ email, password }));
    assert.ok(await db.workspace.findUnique({ where: { id: workspaceId } }));
    await controller.setAccountState(userId, "enable", request);
    assert.equal((await auth.login({ email, password })).user.id, userId);
    assert.equal(await db.auditLog.count({ where: { actorId: admin.id, action: { in: ["admin.account_disabled", "admin.account_enabled"] } } }), 2);
  } finally {
    await db.auditLog.deleteMany({ where: { OR: [{ actorId: admin.id }, ...(userId ? [{ actorId: userId }] : [])] } });
    if (workspaceId) await db.workspace.deleteMany({ where: { id: workspaceId } });
    if (userId) await db.user.deleteMany({ where: { id: userId } });
    await db.user.deleteMany({ where: { id: admin.id } });
    await db.$disconnect();
  }
});
