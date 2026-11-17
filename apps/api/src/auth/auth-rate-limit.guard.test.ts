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

test("expired entries are removed without resetting active limits", () => {
  const originalNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    const guard = new AuthRateLimitGuard();
    const context = (email: string) => ({ switchToHttp: () => ({ getRequest: () => ({ ip: "127.0.0.1", body: { email } }) }) }) as never;
    guard.canActivate(context("expired@example.com"));
    now += 60_000;
    for (let attempt = 0; attempt < 5; attempt++) guard.canActivate(context("active@example.com"));
    now += 14 * 60_000;
    assert.equal(guard.canActivate(context("new@example.com")), true);
    assert.throws(() => guard.canActivate(context("active@example.com")), HttpException);
    assert.equal((guard as unknown as { entries: Map<string, unknown> }).entries.size, 2);
    assert.equal(guard.canActivate(context("expired@example.com")), true);
  } finally {
    Date.now = originalNow;
  }
});

test("capacity is bounded, preserves active limits and recovers when entries expire", () => {
  const originalNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    const guard = new AuthRateLimitGuard();
    const context = (email: string) => ({ switchToHttp: () => ({ getRequest: () => ({ ip: "127.0.0.1", body: { email } }) }) }) as never;
    for (let i = 0; i < 10_000; i++) guard.canActivate(context(`user${i}@example.com`));
    for (let attempt = 1; attempt < 5; attempt++) assert.equal(guard.canActivate(context("user0@example.com")), true);
    assert.throws(() => guard.canActivate(context("overflow@example.com")), HttpException);
    assert.throws(() => guard.canActivate(context("user0@example.com")), HttpException);
    const entries = (guard as unknown as { entries: Map<string, unknown> }).entries;
    assert.equal(entries.size, 10_000);
    assert.ok([...entries.keys()].every((key) => key.length === 64));
    now += 15 * 60_000;
    assert.equal(guard.canActivate(context("overflow@example.com")), true);
    assert.equal(entries.size, 1);
  } finally {
    Date.now = originalNow;
  }
});
