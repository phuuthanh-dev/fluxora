import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { BillingService } from "./billing.service";
import { WorkspaceService } from "../workspaces/workspace.service";

test("Lemon retries, concurrent webhooks, duplicates and early refunds preserve entitlements", { skip: process.env.FLUXORA_PLAN_INTEGRATION !== "1" }, async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Lemon integration requires an isolated local test database.");
  const settings: Record<string, string> = { NODE_ENV: "test", LEMON_API_KEY: "test-only", LEMON_SIGNING_SECRET: "test-only-signing-secret", LEMON_STORE_ID: "7", LEMON_STORE_HOST: "test.lemonsqueezy.com", LEMON_STARTER_VARIANT_ID: "9", LEMON_PRO_VARIANT_ID: "10", LEMON_TEST_MODE: "true" };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  const oldFetch = globalThis.fetch;
  const db = new PrismaClient(), suffix = randomUUID(), user = `lemon-${suffix}`, workspace = `lemon-space-${suffix}`;
  const orderId = randomUUID(), refundOrderId = randomUUID(), nonce = "a".repeat(64), nonceHash = createHash("sha256").update(nonce).digest("hex");
  const primaryId = String(Date.now()) + String(Math.floor(Math.random() * 1000)).padStart(3, "0"), duplicateId = String(BigInt(primaryId) + 1n), refundId = String(BigInt(primaryId) + 2n);
  let unavailable = true;
  globalThis.fetch = async (input) => {
    const path = String(input); if (unavailable) return new Response(null, { status: 503 });
    const id = path.match(/(?:orders\/|order_id%5D=)(\d+)$/)?.[1];
    if (!id) throw new Error("Unexpected provider request");
    if (path.includes("order-items?")) return Response.json({ data: [{ id: "item" }], meta: { page: { total: 1 } } });
    return Response.json({ data: { id, type: "orders", attributes: { store_id: 7, test_mode: true, status: "paid", refunded: false, currency: "VND", discount_total: 0, total_usd: 775, first_order_item: { variant_id: 10, order_id: Number(id), quantity: 1, price: 19900000, test_mode: true } } } });
  };
  function event(localOrderId: string, providerOrderId: string, eventName = "order_created") {
    const payload = { meta: { event_name: eventName, custom_data: { fluxora_order_id: localOrderId, fluxora_nonce: nonce } }, data: { type: "orders", id: providerOrderId } };
    const body = Buffer.from(JSON.stringify(payload));
    return { body, payload, signature: createHmac("sha256", settings.LEMON_SIGNING_SECRET!).update(body).digest("hex") };
  }
  try {
    const oldPaidUntil = new Date(Date.now() + 10 * 86400000);
    await db.user.create({ data: { id: user, email: `${suffix}@example.test` } });
    await db.workspace.create({ data: { id: workspace, name: "Test", slug: `lemon-${suffix}`, ownerId: user, paidPlan: "STARTER", paidUntil: oldPaidUntil, members: { create: { userId: user, role: "OWNER" } } } });
    await db.paymentOrder.create({ data: { id: orderId, workspaceId: workspace, plan: "PRO", amount: 199000, status: "PENDING", provider: "LEMON", providerNonceHash: nonceHash, upgradeFromPaidUntil: oldPaidUntil } });
    const billing = new BillingService(db as never, new WorkspaceService(db as never));
    const first = event(orderId, primaryId);
    await assert.rejects(billing.handleLemonWebhook(first.body, first.signature, first.payload), /temporarily unavailable/);
    assert.equal((await db.lemonPayment.findUniqueOrThrow({ where: { providerOrderId: primaryId } })).status, "PENDING");
    unavailable = false;
    const before = Date.now();
    await Promise.all([billing.reconcile(workspace, user, orderId), billing.handleLemonWebhook(first.body, first.signature, first.payload)]);
    const upgraded = await db.workspace.findUniqueOrThrow({ where: { id: workspace } });
    assert.equal(upgraded.paidPlan, "PRO"); assert.ok(upgraded.usageResetAt && upgraded.usageResetAt.getTime() >= before);
    assert.ok(upgraded.paidUntil && upgraded.paidUntil.getTime() >= before + 30 * 86400000 && upgraded.paidUntil.getTime() <= Date.now() + 30 * 86400000);
    const duplicate = event(orderId, duplicateId);
    await Promise.all([billing.handleLemonWebhook(duplicate.body, duplicate.signature, duplicate.payload), billing.handleLemonWebhook(duplicate.body, duplicate.signature, duplicate.payload)]);
    assert.equal((await db.lemonPayment.findUniqueOrThrow({ where: { providerOrderId: duplicateId } })).reason, "DUPLICATE");
    assert.equal((await db.workspace.findUniqueOrThrow({ where: { id: workspace } })).paidUntil?.getTime(), upgraded.paidUntil!.getTime());
    await db.paymentOrder.create({ data: { id: refundOrderId, workspaceId: workspace, plan: "PRO", amount: 199000, status: "PENDING", provider: "LEMON", providerNonceHash: nonceHash } });
    const refund = event(refundOrderId, refundId, "order_refunded"), latePaid = event(refundOrderId, refundId);
    await billing.handleLemonWebhook(refund.body, refund.signature, refund.payload);
    await billing.handleLemonWebhook(latePaid.body, latePaid.signature, latePaid.payload);
    assert.equal((await db.lemonPayment.findUniqueOrThrow({ where: { providerOrderId: refundId } })).status, "REFUNDED");
    assert.equal((await db.workspace.findUniqueOrThrow({ where: { id: workspace } })).paidUntil?.getTime(), upgraded.paidUntil!.getTime());
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await db.lemonPayment.deleteMany({ where: { paymentOrderId: { in: [orderId, refundOrderId] } } });
    await db.paymentOrder.deleteMany({ where: { workspaceId: workspace } });
    await db.workspace.deleteMany({ where: { id: workspace } });
    await db.user.deleteMany({ where: { id: user } });
    await db.$disconnect();
  }
});
