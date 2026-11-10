import "reflect-metadata";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { AdminGuard } from "./admin.guard";
import { AuthenticationGuard } from "../auth/authentication.guard";
import { AccountRequestGuard } from "../auth/account-request.guard";
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
  const controller = new AdminController({ $transaction: async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx) } as never, {} as never, {} as never);
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
  } as never, {} as never, {} as never);
  await controller.executions(); await controller.audit();
  const requested = JSON.stringify([executionQuery, auditQuery]);
  for (const forbidden of ["triggerData", "errorMessage", "metadata", "encryptedData", "tokenHash"]) assert.equal(requested.includes(forbidden), false);
  await assert.rejects(controller.users("x".repeat(81)));
});

test("admin execution filters are validated and combined without exposing run payloads", async () => {
  let query: { where: Record<string, unknown> } | undefined;
  const controller = new AdminController({ execution: { findMany: async (input: { where: Record<string, unknown> }) => { query = input; return []; } } } as never, {} as never, {} as never);
  await controller.executions("Steam", "2", "FAILED", "24h");
  assert.equal(query?.where.status, "FAILED");
  assert.ok(query?.where.createdAt);
  assert.ok(query?.where.workflowVersion);
  await assert.rejects(controller.executions(undefined, undefined, "BROKEN", "24h"));
  await assert.rejects(controller.executions(undefined, undefined, "FAILED", "forever"));
});

test("admin contextual filters validate IDs and bound combined audit dates to UTC days", async () => {
  const queries: Record<string, { where: Record<string, unknown>; skip: number; take: number }> = {};
  const model = (name: string) => ({ findMany: async (query: typeof queries[string]) => { queries[name] = query; return []; } });
  const controller = new AdminController({ user: model("user"), workspace: model("workspace"), workflow: model("workflow"), execution: model("execution"), auditLog: model("audit") } as never, {} as never, {} as never);
  await controller.users(undefined, undefined, "user-1");
  await controller.workspaces("Test", "1", { userId: "user-1", workspaceId: "space-1" });
  await controller.workflows(undefined, "2", { workspaceId: "space-1", workflowId: "flow-1" });
  await controller.executions("Test", "1", "FAILED", "all", { workflowId: "flow-1", executionId: "run-1" });
  await controller.audit("published", "2", { actor: "owner@example.test", actorId: "user-1", targetType: "workflow", targetId: "flow-1", workspaceId: "space-1", from: "2026-11-01", to: "2026-11-09" });
  assert.equal(queries.user!.where.id, "user-1");
  assert.equal(queries.workspace!.where.ownerId, "user-1");
  assert.equal(queries.workflow!.where.workspaceId, "space-1");
  assert.equal(queries.execution!.where.id, "run-1");
  assert.equal(queries.audit!.skip, 50); assert.equal(queries.audit!.take, 51);
  assert.deepEqual(queries.audit!.where.createdAt, { gte: new Date("2026-11-01T00:00:00Z"), lt: new Date("2026-11-10T00:00:00Z") });
  assert.equal(queries.audit!.where.actorId, "user-1");
  assert.equal(queries.audit!.where.targetId, "flow-1");
  assert.deepEqual(queries.audit!.where.actor, { email: { contains: "owner@example.test", mode: "insensitive" } });
  await assert.rejects(controller.executions("Test", "1", "", "all", { workflowId: ["bad"] as never }));
  for (const filters of [{ from: "2026-02-30" }, { from: "2026-11-10", to: "2026-11-01" }, { actor: ["one", "two"] }, { targetId: "x".repeat(129) }]) await assert.rejects(controller.audit(undefined, undefined, filters as never));
});

test("Jira privacy endpoints inherit administrator, session and mutation-origin protection", () => {
  const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, AdminController);
  for (const guard of [AdminGuard, AuthenticationGuard, AccountRequestGuard]) assert.ok(guards.includes(guard));
  for (const method of ["jiraPrivacyRecords", "jiraPrivacyDiscover", "jiraPrivacyPreview", "jiraPrivacyResolve", "jiraPrivacyRecover"] as const) assert.equal(typeof AdminController.prototype[method], "function");
});
