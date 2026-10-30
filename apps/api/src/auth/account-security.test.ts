import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import type { ArgumentsHost, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { AccountController, AccountExceptionFilter } from "./account.controller";
import { AccountRequestGuard } from "./account-request.guard";
import { AccountMailService, accountMailConfig } from "./account-mail.service";
import { AccountService } from "./account.service";
import type { PrismaService } from "../database/prisma.service";

test("account mutations reject cross-origin and non-JSON requests and throttle abuse", () => {
  const guard = new AccountRequestGuard();
  const context = (method = "POST", origin = process.env.WEB_ORIGIN ?? "http://localhost:3000", json = true) => ({ switchToHttp: () => ({ getRequest: () => ({ method, headers: { origin }, ip: "192.0.2.10", is: () => json }) }) }) as ExecutionContext;
  assert.throws(() => guard.canActivate(context("POST", "https://attacker.example")));
  assert.throws(() => guard.canActivate(context("POST", undefined, false)));
  for (let i = 0; i < 20; i++) assert.equal(guard.canActivate(context()), true);
  assert.throws(() => guard.canActivate(context()), { status: 429 });
  assert.equal(guard.canActivate(context("GET")), true);
});

test("system SMTP is opt-in, requires TLS and rejects untrusted reset origins", () => {
  assert.equal(accountMailConfig({}), null);
  assert.throws(() => accountMailConfig({ ACCOUNT_MAIL_ENABLED: "true" }));
  const env = { ACCOUNT_MAIL_ENABLED: "true", ACCOUNT_SMTP_HOST: "smtp.example.test", ACCOUNT_SMTP_PORT: "587", ACCOUNT_SMTP_USER: "fixture", ACCOUNT_SMTP_PASSWORD: "synthetic-password", ACCOUNT_MAIL_FROM: "security@example.test", WEB_ORIGIN: "https://app.example.test", NODE_ENV: "production", APP_ENCRYPTION_KEY: randomBytes(32).toString("base64") };
  assert.equal(accountMailConfig(env)?.port, 587);
  for (const WEB_ORIGIN of ["http://app.example.test", "https://user:pass@app.example.test", "https://app.example.test/path", "https://app.example.test/?redirect=bad"]) assert.throws(() => accountMailConfig({ ...env, WEB_ORIGIN }));
  assert.throws(() => accountMailConfig({ ...env, ACCOUNT_SMTP_PORT: "25" }));
  assert.throws(() => accountMailConfig({ ...env, ACCOUNT_MAIL_FROM: "a@example.test,b@example.test" }));
  assert.throws(() => accountMailConfig({ ...env, APP_ENCRYPTION_KEY: "" }));
});

test("disabled recovery behaves identically without consulting account existence", async () => {
  const accounts = new AccountService({} as PrismaService, { config: () => null } as AccountMailService);
  await assert.rejects(accounts.forgot("any@example.test"), { status: 503 });
});

test("controller validates malformed requests and preserves the generic response", async () => {
  let received = "";
  const accounts = { forgot: async (email: string) => { received = email; } } as AccountService;
  const controller = new AccountController(accounts, {} as AccountMailService);
  for (const email of [null, [], {}, "no-at-sign", "one@example.test,two@example.test"]) await assert.rejects(controller.forgot({ body: { email } } as Request));
  const result = await controller.forgot({ body: { email: "TEST@example.test" } } as Request);
  assert.equal(received, "test@example.test");
  assert.deepEqual(result, { message: "If an account matches that email, a reset link will arrive shortly." });
});

test("account exception responses never expose database or transport exception details", () => {
  let status = 0; let body: unknown;
  const response = { setHeader: () => undefined, status: (code: number) => { status = code; return response; }, json: (value: unknown) => { body = value; } };
  new AccountExceptionFilter().catch(new Error("SYNTHETIC_SECRET_MUST_NOT_ESCAPE"), { switchToHttp: () => ({ getResponse: () => response }) } as ArgumentsHost);
  assert.equal(status, 503);
  assert.equal(JSON.stringify(body).includes("SYNTHETIC_SECRET_MUST_NOT_ESCAPE"), false);
});
