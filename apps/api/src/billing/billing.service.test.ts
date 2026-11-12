import assert from "node:assert/strict";
import test from "node:test";
import { BillingService } from "./billing.service";
import { PayOS } from "@payos/node";

test("checkout remains unavailable by default and checks workspace ownership first", async () => {
  const prior = process.env.PAYOS_CHECKOUT_ENABLED;
  delete process.env.PAYOS_CHECKOUT_ENABLED;
  let checked = false;
  const workspaces = { requireOwner: async () => { checked = true; } };
  try {
    const service = new BillingService({} as never, workspaces as never);
    await assert.rejects(service.createCheckout("w", "u", "PRO"), /Paid plans are not available/);
    assert.equal(checked, true);
    await assert.rejects(service.createCheckout("w", "u", "FREE"), /valid plan/);
  } finally { if (prior === undefined) delete process.env.PAYOS_CHECKOUT_ENABLED; else process.env.PAYOS_CHECKOUT_ENABLED = prior; }
});

test("webhook verifies signature and provider order before granting paid access exactly once", async () => {
  let status = "PENDING";
  let grants = 0;
  let verified = true;
  let remoteAmount = 99000;
  let remotePaid = 99000;
  const data = { orderCode: 1, amount: 99000, currency: "VND", code: "00", paymentLinkId: "link" };
  const order = () => ({ id: "order", workspaceId: "workspace", amount: 99000, plan: "STARTER", paymentLinkId: "link", status });
  const tx = {
    $queryRaw: async () => [],
    paymentOrder: { findUniqueOrThrow: async () => order(), update: async ({ data: update }: { data: { status: string } }) => { status = update.status; } },
    workspace: { findUniqueOrThrow: async () => ({ paidPlan: null, paidUntil: null }), update: async () => { grants++; } },
  };
  const prisma = { paymentOrder: { findUnique: async () => order() }, $transaction: async (fn: (value: typeof tx) => Promise<void>) => fn(tx) };
  class TestBilling extends BillingService {
    protected override client() { return { webhooks: { verify: async () => { if (!verified) throw new Error("bad signature"); return data; } }, paymentRequests: { get: async () => ({ id: "link", orderCode: 1, amount: remoteAmount, amountPaid: remotePaid, amountRemaining: 99000 - remotePaid, status: "PAID" }) } } as unknown as PayOS; }
  }
  const service = new TestBilling(prisma as never, {} as never);
  verified = false;
  await assert.rejects(service.handleWebhook({}), /Invalid payment notification/);
  verified = true; remoteAmount = 1;
  await assert.rejects(service.handleWebhook({}), /not fully confirmed/);
  assert.equal(grants, 0);
  remoteAmount = 99000; remotePaid = 50000;
  await assert.rejects(service.handleWebhook({}), /not fully confirmed/);
  assert.equal(grants, 0);
  remotePaid = 99000;
  await service.handleWebhook({});
  await service.handleWebhook({});
  assert.equal(status, "PAID");
  assert.equal(grants, 1);
});

test("latest order indicates whether checkout can be resumed without returning its URL", async () => {
  const order = { id: "order", plan: "STARTER", amount: 99000, status: "PENDING", createdAt: new Date(), checkoutUrl: "https://pay.payos.vn/example" };
  const service = new BillingService({ paymentOrder: { findFirst: async () => order } } as never, { requireOwner: async () => undefined } as never);
  const result = await service.latest("workspace", "owner");
  assert.equal(result?.canResume, true);
  assert.equal("checkoutUrl" in (result ?? {}), false);
});

test("official SDK rejects a forged notification without making a provider request", async () => {
  const old = [process.env.PAYOS_CLIENT_ID, process.env.PAYOS_API_KEY, process.env.PAYOS_CHECKSUM_KEY];
  process.env.PAYOS_CLIENT_ID = "test-client"; process.env.PAYOS_API_KEY = "test-key"; process.env.PAYOS_CHECKSUM_KEY = "test-checksum";
  try {
    const service = new BillingService({} as never, {} as never);
    await assert.rejects(service.handleWebhook({ code: "00", success: true, signature: "forged", data: { orderCode: 1, amount: 99000, currency: "VND", code: "00", paymentLinkId: "link", description: "test", accountNumber: "", reference: "test", transactionDateTime: "2026-11-12 12:00:00", desc: "test" } }), /Invalid payment notification/);
  } finally {
    for (const [index, key] of ["PAYOS_CLIENT_ID", "PAYOS_API_KEY", "PAYOS_CHECKSUM_KEY"].entries()) {
      if (old[index] === undefined) delete process.env[key]; else process.env[key] = old[index];
    }
  }
});

test("a verified payOS registration sample for an unknown order grants no access", async () => {
  let lookedUp = false;
  class TestBilling extends BillingService {
    protected override client() { return { webhooks: { verify: async () => ({ orderCode: 123, amount: 3000, currency: "VND", code: "00", paymentLinkId: "sample" }) }, paymentRequests: { get: async () => { lookedUp = true; throw new Error("must not call"); } } } as unknown as PayOS; }
  }
  const prisma = { paymentOrder: { findUnique: async () => null } };
  const service = new TestBilling(prisma as never, {} as never);
  assert.deepEqual(await service.handleWebhook({}), { received: true });
  assert.equal(lookedUp, false);
});

test("reconciliation only clears a cancelled unpaid order for its owner", async () => {
  let update: unknown;
  let ownerChecked = false;
  class TestBilling extends BillingService {
    protected override client() { return { paymentRequests: { get: async () => ({ id: "link", orderCode: 12, amount: 99000, amountPaid: 0, amountRemaining: 99000, status: "CANCELLED" }) } } as unknown as PayOS; }
  }
  const order = { id: "order", workspaceId: "w", orderCode: 12n, amount: 99000, paymentLinkId: "link", status: "PENDING", plan: "STARTER", paidAt: null };
  const prisma = { paymentOrder: { findFirst: async () => order, updateMany: async (query: unknown) => { update = query; return { count: 1 }; } } };
  const service = new TestBilling(prisma as never, { requireOwner: async () => { ownerChecked = true; } } as never);
  await service.reconcile("w", "owner", "order");
  assert.equal(ownerChecked, true);
  assert.deepEqual(update, { where: { id: "order", status: { in: ["PENDING", "REVIEW"] } }, data: { status: "CANCELLED", checkoutUrl: null } });
});
