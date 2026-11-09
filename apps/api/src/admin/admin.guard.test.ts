import assert from "node:assert/strict";
import test from "node:test";
import { AdminGuard } from "./admin.guard";

test("platform administrator access fails closed and is independent of workspace roles", () => {
  const previous = process.env.PLATFORM_ADMIN_USER_ID;
  const context = (id: string) => ({ switchToHttp: () => ({ getRequest: () => ({ currentUser: { id, role: "OWNER" } }) }) }) as never;
  try {
    delete process.env.PLATFORM_ADMIN_USER_ID;
    assert.throws(() => new AdminGuard().canActivate(context("owner")));
    process.env.PLATFORM_ADMIN_USER_ID = "admin";
    assert.throws(() => new AdminGuard().canActivate(context("owner")));
    assert.equal(new AdminGuard().canActivate(context("admin")), true);
  } finally {
    if (previous === undefined) delete process.env.PLATFORM_ADMIN_USER_ID;
    else process.env.PLATFORM_ADMIN_USER_ID = previous;
  }
});
