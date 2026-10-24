import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { AuthRateLimitGuard } from "./auth-rate-limit.guard";

test("authentication rate limit tracks an email and IP pair", () => {
  const guard = new AuthRateLimitGuard();
  const context = { switchToHttp: () => ({ getRequest: () => ({ ip: "127.0.0.1", body: { email: "OWNER@example.com" } }) }) } as never;
  for (let attempt = 0; attempt < 5; attempt += 1) assert.equal(guard.canActivate(context), true);
  assert.throws(() => guard.canActivate(context), HttpException);
});
