import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import type { PayOS } from "@payos/node";
import { BillingService } from "./billing.service";
import { WorkspaceService } from "../workspaces/workspace.service";
import { ExecutionService } from "../execution/execution.service";

test("concurrent payment notifications upgrade once without resetting recorded usage", { skip: process.env.FLUXORA_CREDENTIAL_INTEGRATION !== "1" }, async () => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(database.pathname) || !["localhost", "127.0.0.1"].includes(database.hostname)) throw new Error("Billing integration requires an isolated local test database.");
  const db = new PrismaClient(), suffix = randomUUID();
  const user = `billing-${suffix}`, space = `billing-space-${suffix}`, flow = `billing-flow-${suffix}`, version = `billing-version-${suffix}`;
  const previousEnabled = process.env.PAYOS_CHECKOUT_ENABLED, previousOrigin = process.env.WEB_ORIGIN, previousLimits = process.env.PLAN_LIMITS_ENABLED;
  process.env.PAYOS_CHECKOUT_ENABLED = "true"; process.env.PLAN_LIMITS_ENABLED = "true"; process.env.WEB_ORIGIN = "http://localhost:3000";
  let orderCode = 0;
  class TestBilling extends BillingService {
    protected override client() { return {
      paymentRequests: {
        create: async ({ orderCode: code }: { orderCode: number }) => { orderCode = code; return { orderCode: code, amount: 199000, currency: "VND", paymentLinkId: `test-${suffix}`, checkoutUrl: "https://pay.payos.vn/test" }; },
        get: async () => ({ id: `test-${suffix}`, orderCode, amount: 199000, amountPaid: 199000, amountRemaining: 0, status: "PAID" }),
      },
      webhooks: { verify: async () => ({ orderCode, amount: 199000, currency: "VND", code: "00", paymentLinkId: `test-${suffix}` }) },
    } as unknown as PayOS; }
  }
  try {
    const paidUntil = new Date(Date.now() + 15 * 86400000);
    await db.user.create({ data: { id: user, email: `${suffix}@example.test` } });
    await db.workspace.create({ data: { id: space, name: "Test", slug: `billing-${suffix}`, ownerId: user, paidPlan: "STARTER", paidUntil, members: { create: { userId: user, role: "OWNER" } } } });
    await db.usageRun.createMany({ data: Array.from({ length: 10000 }, (_, i) => ({ executionId: `usage-${suffix}-${i}`, workspaceId: space, startedAt: new Date(Date.now() - 60000) })) });
    const service = new TestBilling(db as never, new WorkspaceService(db as never));
    await service.createCheckout(space, user, "PRO", paidUntil.toISOString(), true);
    const before = Date.now();
    await Promise.all([service.handleWebhook({}), service.handleWebhook({})]);
    const result = await db.workspace.findUniqueOrThrow({ where: { id: space } });
    assert.equal(result.paidPlan, "PRO");
    assert.ok(result.paidUntil && result.paidUntil.getTime() >= before + 30 * 86400000 && result.paidUntil.getTime() <= Date.now() + 30 * 86400000);
    assert.equal(await db.usageRun.count({ where: { workspaceId: space } }), 10000);
    assert.equal((await new WorkspaceService(db as never).planUsage(space, user)).trackedRuns, 0);
    await db.workflow.create({ data: { id: flow, workspaceId: space, name: "Test" } });
    await db.workflowVersion.create({ data: { id: version, workflowId: flow, version: 1, graph: { nodes: [{ id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} }], edges: [] } } });
    const execution = await db.execution.create({ data: { workflowVersionId: version, mode: "LIVE" } });
    const runner = new ExecutionService(db as never, {} as never, { publish() {} } as never);
    assert.notEqual((await runner.run(execution.id, "live"))?.errorCode, "PLAN_RUN_LIMIT");
    assert.equal((await new WorkspaceService(db as never).planUsage(space, user)).trackedRuns, 1);
    assert.equal((await db.paymentOrder.findFirstOrThrow({ where: { workspaceId: space } })).status, "PAID");
  } finally {
    if (previousEnabled === undefined) delete process.env.PAYOS_CHECKOUT_ENABLED; else process.env.PAYOS_CHECKOUT_ENABLED = previousEnabled;
    if (previousOrigin === undefined) delete process.env.WEB_ORIGIN; else process.env.WEB_ORIGIN = previousOrigin;
    if (previousLimits === undefined) delete process.env.PLAN_LIMITS_ENABLED; else process.env.PLAN_LIMITS_ENABLED = previousLimits;
    await db.execution.deleteMany({ where: { workflowVersionId: version } });
    await db.workflow.deleteMany({ where: { workspaceId: space } });
    await db.paymentOrder.deleteMany({ where: { workspaceId: space } });
    await db.workspace.deleteMany({ where: { id: space } });
    await db.user.deleteMany({ where: { id: user } });
    await db.$disconnect();
  }
});
