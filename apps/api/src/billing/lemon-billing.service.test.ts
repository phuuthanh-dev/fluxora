import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { BillingService } from "./billing.service";

test("card checkout verifies signed provider orders and grants access only once", async () => {
  const settings: Record<string, string> = { LEMON_CHECKOUT_ENABLED: "true", LEMON_TEST_MODE: "true", PLAN_LIMITS_ENABLED: "true", LEMON_API_KEY: "fake-key", LEMON_SIGNING_SECRET: "fake-signing-secret", LEMON_STORE_ID: "7", LEMON_STORE_HOST: "test.lemonsqueezy.com", LEMON_STARTER_VARIANT_ID: "9", LEMON_PRO_VARIANT_ID: "10", WEB_ORIGIN: "http://localhost:3000", NODE_ENV: "test" };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  const oldFetch = globalThis.fetch;
  let nonce = "", grants = 0, paid = true;
  const order = { id: "a1b2c3d4-1234-1234-1234-123456789abc", orderCode: 1n, workspaceId: "w", amount: 99000, plan: "STARTER", status: "CREATING", provider: "LEMON", providerNonceHash: null as string | null, providerOrderId: null as string | null, providerRefundedAt: null as Date | null, paymentLinkId: null as string | null, checkoutUrl: null as string | null, upgradeFromPaidUntil: null as Date | null };
  const workspace = { paidPlan: null as string | null, paidUntil: null as Date | null };
  const payments = new Map<string, { providerOrderId: string; paymentOrderId: string; status: string; reason?: string | null }>();
  const tx = {
    $queryRaw: async () => [],
    workspace: { findUniqueOrThrow: async () => workspace, update: async ({ data }: { data: { paidPlan: string; paidUntil: Date } }) => { Object.assign(workspace, data); grants++; } },
    paymentOrder: {
      findFirst: async () => null,
      create: async () => order,
      findUniqueOrThrow: async () => order,
      update: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(order, data); },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(order, data); return { count: 1 }; },
    },
    lemonPayment: {
      findUnique: async ({ where }: { where: { providerOrderId: string } }) => payments.get(where.providerOrderId) ?? null,
      findUniqueOrThrow: async ({ where }: { where: { providerOrderId: string } }) => { const value = payments.get(where.providerOrderId); if (!value) throw new Error("Missing payment"); return value; },
      create: async ({ data }: { data: { providerOrderId: string; paymentOrderId: string; status: string } }) => { payments.set(data.providerOrderId, data); return data; },
      update: async ({ where, data }: { where: { providerOrderId: string }; data: Record<string, unknown> }) => { const value = payments.get(where.providerOrderId)!; Object.assign(value, data); return value; },
      upsert: async ({ where, create, update }: { where: { providerOrderId: string }; create: { providerOrderId: string; paymentOrderId: string; status: string }; update: Record<string, unknown> }) => { const value = payments.get(where.providerOrderId) ?? create; Object.assign(value, payments.has(where.providerOrderId) ? update : {}); payments.set(where.providerOrderId, value); return value; },
      findMany: async () => [...payments.values()].filter((payment) => payment.status === "PENDING"),
    },
  };
  const prisma = { paymentOrder: { ...tx.paymentOrder, findUnique: async () => order, findFirst: async () => order }, lemonPayment: tx.lemonPayment, $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) };
  globalThis.fetch = async (url, options) => {
    const path = String(url);
    if (path.endsWith("/variants/9")) return Response.json({ data: { id: "9", attributes: { price: 9900000, test_mode: true, is_subscription: false, product_id: 11 } } });
    if (path.endsWith("/products/11")) return Response.json({ data: { attributes: { store_id: 7, test_mode: true, status: "published" } } });
    if (path.endsWith("/checkouts")) {
      const body = JSON.parse(String(options?.body)); nonce = body.data.attributes.checkout_data.custom.fluxora_nonce;
      return Response.json({ data: { id: "checkout", attributes: { test_mode: true, url: "https://test.lemonsqueezy.com/checkout/custom/abc" } } });
    }
    if (/\/orders\/(123|124)$/.test(path)) { const id = path.split("/").pop()!; return Response.json({ data: { id, type: "orders", attributes: { store_id: 7, test_mode: true, status: paid ? "paid" : "pending", refunded: false, currency: "VND", discount_total: 0, total_usd: 386, first_order_item: { variant_id: 9, order_id: Number(id), quantity: 1, price: 9900000, test_mode: true } } } }); }
    if (/\/order-items\?filter%5Border_id%5D=(123|124)$/.test(path)) return Response.json({ data: [{ id: "item" }], meta: { page: { total: 1 } } });
    throw new Error("Unexpected provider request");
  };
  try {
    const service = new BillingService(prisma as never, { requireOwner: async () => undefined } as never);
    await service.createCheckout("w", "u", "STARTER", undefined, undefined, "card");
    const payload = { meta: { event_name: "order_created", custom_data: { fluxora_order_id: order.id, fluxora_nonce: nonce } }, data: { type: "orders", id: "123" } };
    const body = Buffer.from(JSON.stringify(payload));
    const signature = createHmac("sha256", settings.LEMON_SIGNING_SECRET!).update(body).digest("hex");
    await assert.rejects(service.handleLemonWebhook(body, "0".repeat(64), payload), /Invalid payment/);
    paid = false; await assert.rejects(service.handleLemonWebhook(body, signature, payload), /not fully confirmed/); assert.equal(grants, 0);
    assert.equal(payments.get("123")?.status, "PENDING");
    paid = true; await service.reconcile("w", "u", order.id); await service.handleLemonWebhook(body, signature, payload);
    assert.equal(grants, 1); assert.equal(order.status, "PAID"); assert.equal(order.providerOrderId, "123");
    const duplicate = { ...payload, data: { type: "orders", id: "124" } };
    const duplicateBody = Buffer.from(JSON.stringify(duplicate));
    await service.handleLemonWebhook(duplicateBody, createHmac("sha256", settings.LEMON_SIGNING_SECRET!).update(duplicateBody).digest("hex"), duplicate);
    assert.equal(grants, 1); assert.equal(payments.get("124")?.status, "REVIEW"); assert.equal(payments.get("124")?.reason, "DUPLICATE");
    payments.clear();
    order.status = "PENDING"; order.providerOrderId = null; order.providerRefundedAt = null; grants = 0;
    const refunded = { ...payload, meta: { ...payload.meta, event_name: "order_refunded" } };
    const refundBody = Buffer.from(JSON.stringify(refunded));
    const refundSignature = createHmac("sha256", settings.LEMON_SIGNING_SECRET!).update(refundBody).digest("hex");
    await service.handleLemonWebhook(refundBody, refundSignature, refunded);
    await service.handleLemonWebhook(body, signature, payload);
    assert.equal(grants, 0); assert.equal(order.status, "REVIEW"); assert.ok(order.providerRefundedAt);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
