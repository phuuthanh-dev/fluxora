import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ProviderWebhookRecoveryService } from "./provider-webhook-recovery.service";

test("recovery marks only expired in-flight writes uncertain with bounded race-safe predicates", async () => {
  const reads: any[] = [];
  const updates: any[] = [];
  const service = new ProviderWebhookRecoveryService({ providerWebhookRegistration: {
    findMany: async (args: any) => { reads.push(args); return args.where.state === "CREATE_DISPATCHING" ? [{ id: "create" }] : [{ id: "delete" }]; },
    updateMany: async (args: any) => { updates.push(args); return { count: args.where.state === "CREATE_DISPATCHING" ? 1 : 0 }; },
  } } as never);
  const result = await service.recover(new Date("2026-01-01T00:10:00Z"));
  assert.deepEqual(result, { create: 1, delete: 0 });
  assert.ok(reads.every((args) => args.take === 100 && args.where.updatedAt.lt.toISOString() === "2026-01-01T00:05:00.000Z"));
  assert.deepEqual(updates.map((args) => [args.where.state, args.data.state]), [["CREATE_DISPATCHING", "CREATE_UNCERTAIN"], ["DELETING", "DELETE_UNCERTAIN"]]);
  assert.ok(updates.every((args) => args.where.updatedAt.lt.toISOString() === "2026-01-01T00:05:00.000Z"));
  assert.deepEqual(updates[0].where.id.in, ["create"]);
});

test("recovery does not start unless explicitly enabled and never starts in workers", async () => {
  const enabled = process.env.GITHUB_WEBHOOK_AUTOMATION_ENABLED;
  const role = process.env.PROCESS_ROLE;
  let calls = 0;
  const service = new ProviderWebhookRecoveryService({ providerWebhookRegistration: { findMany: async () => { calls++; return []; } } } as never);
  try {
    delete process.env.GITHUB_WEBHOOK_AUTOMATION_ENABLED;
    service.onModuleInit();
    process.env.GITHUB_WEBHOOK_AUTOMATION_ENABLED = "true";
    process.env.PROCESS_ROLE = "worker";
    service.onModuleInit();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 0);
  } finally {
    service.onModuleDestroy();
    if (enabled === undefined) delete process.env.GITHUB_WEBHOOK_AUTOMATION_ENABLED; else process.env.GITHUB_WEBHOOK_AUTOMATION_ENABLED = enabled;
    if (role === undefined) delete process.env.PROCESS_ROLE; else process.env.PROCESS_ROLE = role;
  }
});
