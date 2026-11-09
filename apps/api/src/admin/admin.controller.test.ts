import assert from "node:assert/strict";
import test from "node:test";
import { AdminController } from "./admin.controller";
import { AuthService } from "../auth/auth.service";

test("disabling an account revokes sessions and writes an audit event in the transaction", async () => {
  const calls: string[] = [];
  const tx = {
    $queryRaw: async () => [{ id: "target" }],
    user: { update: async () => { calls.push("disabled"); } },
    session: { updateMany: async () => { calls.push("revoked"); return { count: 2 }; } },
    auditLog: { create: async ({ data }: { data: { action: string } }) => { calls.push(data.action); } },
  };
  const controller = new AdminController({ $transaction: async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx) } as never, {} as never);
  const request = { currentUser: { id: "admin" } } as never;
  assert.deepEqual(await controller.setAccountState("target", "disable", request), { disabled: true });
  assert.deepEqual(calls, ["disabled", "revoked", "admin.account_disabled"]);
  await assert.rejects(controller.setAccountState("admin", "disable", request));
  await assert.rejects(controller.setAccountState("target", "delete", request));
});

test("disabled users cannot use an existing session or create an OAuth session", async () => {
  let issued = false;
  const tx = {
    authIdentity: { findUnique: async () => ({ id: "identity", userId: "disabled", user: {} }) },
    $queryRaw: async () => [{ id: "disabled" }],
    user: { findUnique: async () => ({ disabledAt: new Date() }) },
    session: { create: async () => { issued = true; } },
  };
  const service = new AuthService({
    session: { findUnique: async () => ({ revokedAt: null, expiresAt: new Date(Date.now() + 10000), user: { disabledAt: new Date() } }) },
    $transaction: async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx),
  } as never);
  await assert.rejects(service.getCurrentUser("synthetic"));
  await assert.rejects(service.loginWithIdentity({ provider: "GOOGLE", providerAccountId: "synthetic", email: "person@example.test" }));
  assert.equal(issued, false);
});

test("administrative execution and audit queries select metadata without payloads or secrets", async () => {
  let executionQuery: unknown; let auditQuery: unknown;
  const controller = new AdminController({
    execution: { findMany: async (query: unknown) => { executionQuery = query; return []; } },
    auditLog: { findMany: async (query: unknown) => { auditQuery = query; return []; } },
  } as never, {} as never);
  await controller.executions(); await controller.audit();
  const requested = JSON.stringify([executionQuery, auditQuery]);
  for (const forbidden of ["triggerData", "errorMessage", "metadata", "encryptedData", "tokenHash"]) assert.equal(requested.includes(forbidden), false);
  await assert.rejects(controller.users("x".repeat(81)));
});
