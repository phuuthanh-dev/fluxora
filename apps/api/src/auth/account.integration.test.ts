import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { config } from "dotenv";
import * as argon2 from "argon2";
import { PrismaService } from "../database/prisma.service";
import { CredentialVaultService } from "../credentials/credential-vault.service";
import { AccountMailService } from "./account-mail.service";
import { AccountService, hashAccountToken } from "./account.service";
import { AuthService } from "./auth.service";

config({ path: resolve(__dirname, "../../../../.env"), quiet: true });

test("account recovery transactions and durable mail on an isolated PostgreSQL schema", { timeout: 90_000 }, async t => {
  // Never scan or dispatch rows in the operator's schema, even when testing locally.
  const schema = `account_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new PrismaService();
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("schema", schema);
  const db = new PrismaService({ datasourceUrl: url.toString() });
  const previousKey = process.env.APP_ENCRYPTION_KEY;
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const vault = new CredentialVaultService();
  const mail = new AccountMailService(db, vault);
  mail.config = () => ({ host: "smtp.example.test", port: 587, user: "fixture", pass: "synthetic-only", from: "security@example.test", origin: "https://app.example.test" });
  const accounts = new AccountService(db, mail);
  const auth = new AuthService(db);
  const oldPassword = "synthetic-original-password";
  const nextPassword = "synthetic-replacement-password";
  let userId = "";
  let email = "";
  async function addUser(password: string | null = oldPassword) {
    const user = await db.user.create({ data: { email: `${randomUUID()}@example.test`, displayName: "Fixture", passwordHash: password ? await argon2.hash(password) : null } });
    userId = user.id; email = user.email;
    return user;
  }
  async function queuedToken() {
    const row = await db.accountMail.findFirstOrThrow({ where: { userId, kind: "PASSWORD_RESET", state: "PENDING" } });
    const payload = vault.decrypt(row.encryptedPayload!);
    const token = String(payload.text).match(/#token=([\w-]{43})/)?.[1];
    assert.ok(token);
    assert.ok(!row.encryptedPayload!.includes(token));
    return token;
  }
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await promisify(execFile)(process.execPath, [resolve(__dirname, "../../node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", resolve(__dirname, "../../prisma/schema.prisma")], { env: { ...process.env, DATABASE_URL: url.toString() }, timeout: 45_000 });

    await t.test("generic requests, persisted cooldown and encrypted outbox; public account/session shapes omit hashes", async () => {
      await addUser();
      const started = Date.now();
      assert.equal(await accounts.forgot("absent@example.test"), undefined);
      assert.ok(Date.now() - started >= 280);
      assert.equal(await db.accountMail.count(), 0);
      await Promise.all([accounts.forgot(email), accounts.forgot(email)]);
      assert.equal(await db.passwordReset.count({ where: { userId } }), 1);
      const token = await queuedToken();
      const stored = await db.passwordReset.findFirstOrThrow({ where: { userId } });
      assert.equal(stored.tokenHash, hashAccountToken(token));
      assert.equal(stored.expiresAt.getTime() - stored.createdAt.getTime() < 31 * 60_000, true);
      const login = await auth.login({ email, password: oldPassword });
      const sessions = await accounts.sessions(userId, login.token);
      assert.equal(sessions[0]?.current, true);
      assert.equal("tokenHash" in sessions[0]!, false);
      assert.equal("passwordHash" in await accounts.account(userId), false);
    });

    await t.test("concurrent consumption succeeds exactly once and revokes every session and outstanding link", async () => {
      const token = await queuedToken();
      await auth.login({ email, password: oldPassword });
      const result = await Promise.allSettled([accounts.reset(token, nextPassword), accounts.reset(token, nextPassword)]);
      assert.equal(result.filter(value => value.status === "fulfilled").length, 1);
      assert.equal(await db.session.count({ where: { userId, revokedAt: null } }), 0);
      assert.equal(await db.passwordReset.count({ where: { userId, usedAt: null } }), 0);
      await assert.rejects(accounts.reset(token, oldPassword));
      await assert.rejects(auth.login({ email, password: oldPassword }));
      await auth.login({ email, password: nextPassword });
      const invalidatedMail = await db.accountMail.findFirstOrThrow({ where: { userId, kind: "PASSWORD_RESET" } });
      assert.equal(invalidatedMail.encryptedPayload, null);
      assert.equal(await db.accountMail.count({ where: { userId, kind: "PASSWORD_CHANGED" } }), 1);
    });

    await t.test("expired and malformed tokens cannot change a password; OAuth-only accounts can recover", async () => {
      await addUser(null);
      assert.equal((await accounts.account(userId)).hasPassword, false);
      await accounts.forgot(email);
      const token = await queuedToken();
      await db.passwordReset.updateMany({ where: { userId }, data: { expiresAt: new Date(0) } });
      await assert.rejects(accounts.reset(token, nextPassword));
      await assert.rejects(accounts.reset("malformed", nextPassword));
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: userId } })).passwordHash, null);
      await db.passwordReset.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() + 30_000) } });
      await accounts.reset(token, nextPassword);
      assert.equal((await accounts.account(userId)).hasPassword, true);
    });

    await t.test("profile and session changes are owner scoped; password changes require the current password", async () => {
      const other = await addUser();
      const foreign = await auth.login({ email, password: oldPassword });
      const foreignSession = (await accounts.sessions(other.id, foreign.token))[0]!;
      await addUser();
      const first = await auth.login({ email, password: oldPassword });
      const second = await auth.login({ email, password: oldPassword });
      await assert.rejects(accounts.revoke(userId, first.token, foreignSession.id));
      await accounts.revoke(userId, first.token);
      assert.equal((await accounts.sessions(userId, first.token)).length, 1);
      await assert.rejects(auth.getCurrentUser(second.token));
      assert.ok(await auth.getCurrentUser(foreign.token));
      assert.equal((await accounts.rename(userId, "Updated fixture")).displayName, "Updated fixture");
      await assert.rejects(accounts.changePassword(userId, "incorrect-password", nextPassword));
      assert.ok(await auth.getCurrentUser(first.token));
      await accounts.changePassword(userId, oldPassword, nextPassword);
      await assert.rejects(auth.getCurrentUser(first.token));
      await auth.login({ email, password: nextPassword });
    });

    await t.test("an old-password login racing a reset cannot create a surviving session", async () => {
      await addUser();
      await accounts.forgot(email);
      const token = await queuedToken();
      const snapshot = await db.user.findUniqueOrThrow({ where: { id: userId } });
      await accounts.reset(token, nextPassword);
      const staleReader = { user: { findUnique: async () => snapshot }, $transaction: db.$transaction.bind(db) } as unknown as PrismaService;
      await assert.rejects(new AuthService(staleReader).login({ email, password: oldPassword }));
      assert.equal(await db.session.count({ where: { userId, revokedAt: null } }), 0);
    });

    await t.test("a failed transaction leaves password, reset token and sessions unchanged", async () => {
      await addUser();
      const session = await auth.login({ email, password: oldPassword });
      await accounts.forgot(email);
      const token = await queuedToken();
      const failingDb = db.$extends({ query: { auditLog: { create: async () => { throw new Error("Synthetic audit failure"); } } } });
      await assert.rejects(new AccountService(failingDb as unknown as PrismaService, mail).reset(token, nextPassword));
      assert.equal((await db.passwordReset.findUniqueOrThrow({ where: { tokenHash: hashAccountToken(token) } })).usedAt, null);
      assert.ok(await auth.getCurrentUser(session.token));
      await auth.login({ email, password: oldPassword });
    });

    await t.test("mail claims are exclusive, encrypted payloads are scrubbed, uncertain dispatch is not retried", async () => {
      await db.accountMail.deleteMany();
      await accounts.forgot("absent@example.test");
      const data = { userId, kind: "PASSWORD_CHANGED", expiresAt: new Date(Date.now() + 60_000), encryptedPayload: mail.encode({ to: email, subject: "Fixture", text: "Synthetic only" }) };
      const success = await db.accountMail.create({ data });
      let sent = 0;
      await Promise.all([mail.flush(async () => { sent++; }), mail.flush(async () => { sent++; })]);
      assert.equal(sent, 1);
      assert.equal((await db.accountMail.findUniqueOrThrow({ where: { id: success.id } })).encryptedPayload, null);
      const failure = await db.accountMail.create({ data });
      await mail.flush(async () => { throw new Error("Synthetic transport failure; not logged"); });
      await mail.flush(async () => { sent++; });
      assert.equal(sent, 1);
      const failed = await db.accountMail.findUniqueOrThrow({ where: { id: failure.id } });
      assert.equal(failed.state, "FAILED"); assert.equal(failed.encryptedPayload, null);
      const stale = await db.accountMail.create({ data: { ...data, state: "SENDING", updatedAt: new Date(Date.now() - 180_000) } });
      await mail.flush(async () => { sent++; });
      assert.equal(sent, 1);
      assert.equal((await db.accountMail.findUniqueOrThrow({ where: { id: stale.id } })).encryptedPayload, null);
    });
  } finally {
    await db.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.$disconnect();
    if (previousKey === undefined) delete process.env.APP_ENCRYPTION_KEY; else process.env.APP_ENCRYPTION_KEY = previousKey;
  }
});
