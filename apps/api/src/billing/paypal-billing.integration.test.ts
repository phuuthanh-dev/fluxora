import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { BillingService } from "./billing.service";
import { WorkspaceService } from "../workspaces/workspace.service";

test("PayPal confirmation, duplicate webhook and refund preserve one entitlement", { skip: process.env.FLUXORA_PLAN_INTEGRATION !== "1" }, async () => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(database.hostname) || !/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(database.pathname)) throw new Error("Requires an isolated local test database.");
  const keys = ["NODE_ENV", "WEB_ORIGIN", "PLAN_LIMITS_ENABLED", "PAYPAL_SANDBOX_ENABLED", "PAYPAL_SANDBOX_CLIENT_ID", "PAYPAL_SANDBOX_CLIENT_SECRET", "PAYPAL_SANDBOX_STARTER_CENTS", "PAYPAL_SANDBOX_PRO_CENTS", "PAYPAL_SANDBOX_WEBHOOK_ID"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { NODE_ENV: "test", WEB_ORIGIN: "http://localhost:3400", PLAN_LIMITS_ENABLED: "true", PAYPAL_SANDBOX_ENABLED: "true", PAYPAL_SANDBOX_CLIENT_ID: "test", PAYPAL_SANDBOX_CLIENT_SECRET: "test", PAYPAL_SANDBOX_STARTER_CENTS: "100", PAYPAL_SANDBOX_PRO_CENTS: "200", PAYPAL_SANDBOX_WEBHOOK_ID: "test" });
  const previousFetch = globalThis.fetch, db = new PrismaClient(), suffix = randomUUID(), user = `paypal-${suffix}`, workspace = `paypal-${suffix}`;
  let approved = false, captured = false, localId = "", captures = 0;
  let providerId = "ORDER123456789";
  let captureId = "CAPTURE123456789", amountValue = "1.00";
  const remote = () => ({ id: providerId, intent: "CAPTURE", status: captured ? "COMPLETED" : approved ? "APPROVED" : "CREATED", purchase_units: [{ custom_id: localId, amount: { currency_code: "USD", value: amountValue }, ...(captured ? { payments: { captures: [{ id: captureId, status: "COMPLETED", amount: { currency_code: "USD", value: amountValue } }] } } : {}) }] });
  globalThis.fetch = async (url, options) => {
    const path = String(url);
    if (path.endsWith("/token")) return Response.json({ token_type: "Bearer", access_token: "test" });
    if (path.endsWith("/verify-webhook-signature")) return Response.json({ verification_status: "SUCCESS" });
    if (path.endsWith("/v2/checkout/orders")) {
      localId = JSON.parse(String(options?.body)).purchase_units[0].custom_id;
      return Response.json({ ...remote(), links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=test" }] });
    }
    if (path.endsWith("/capture")) { assert.equal(approved, true); captured = true; captures++; }
    return Response.json(remote());
  };
  const headers = { authAlgo: "algo", certUrl: "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-TEST", transmissionId: "id", transmissionSig: "sig", transmissionTime: "time" };
  const event = (eventType: string) => Buffer.from(JSON.stringify({ event_type: eventType, resource: { supplementary_data: { related_ids: { order_id: providerId, capture_id: captureId } } } }));
  try {
    await db.user.create({ data: { id: user, email: `${suffix}@example.test` } });
    await db.workspace.create({ data: { id: workspace, name: "Test", slug: `paypal-${suffix}`, ownerId: user, members: { create: { userId: user, role: "OWNER" } } } });
    const service = new BillingService(db as never, new WorkspaceService(db as never));
    const checkout = await service.createCheckout(workspace, user, "STARTER", undefined, undefined, "paypal-sandbox");
    await assert.rejects(service.reconcile(workspace, user, checkout.orderId));
    assert.equal(captures, 0);
    approved = true;
    const approval = Buffer.from(JSON.stringify({ event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: providerId } }));
    await service.handlePayPalWebhook(approval, headers);
    const first = await db.workspace.findUniqueOrThrow({ where: { id: workspace } });
    assert.equal(first.paidPlan, "STARTER"); assert.ok(first.paidUntil);
    await Promise.all([service.handlePayPalWebhook(event("PAYMENT.CAPTURE.COMPLETED"), headers), service.handlePayPalWebhook(event("PAYMENT.CAPTURE.COMPLETED"), headers)]);
    const again = await db.workspace.findUniqueOrThrow({ where: { id: workspace } });
    assert.equal(again.paidUntil?.getTime(), first.paidUntil?.getTime()); assert.equal(captures, 1);
    const mismatch = Buffer.from(JSON.stringify({ event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { supplementary_data: { related_ids: { order_id: providerId, capture_id: "WRONGCAPTURE123" } } } }));
    await assert.rejects(service.handlePayPalWebhook(mismatch, headers));
    assert.equal((await db.paymentOrder.findUniqueOrThrow({ where: { id: checkout.orderId } })).providerRefundedAt, null);
    const refundByCapture = Buffer.from(JSON.stringify({ event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { links: [{ rel: "up", href: `https://api.sandbox.paypal.com/v2/payments/captures/${captureId}` }] } }));
    await service.handlePayPalWebhook(refundByCapture, headers);
    assert.ok((await db.paymentOrder.findUniqueOrThrow({ where: { id: checkout.orderId } })).providerRefundedAt);
    const refundFirst = randomUUID(); providerId = "ORDER987654321"; localId = refundFirst;
    await db.paymentOrder.create({ data: { id: refundFirst, workspaceId: workspace, plan: "STARTER", amount: 100, status: "PENDING", provider: "PAYPAL_SANDBOX", paymentLinkId: providerId } });
    await service.handlePayPalWebhook(event("PAYMENT.CAPTURE.REFUNDED"), headers);
    await service.handlePayPalWebhook(event("PAYMENT.CAPTURE.COMPLETED"), headers);
    assert.equal((await db.paymentOrder.findUniqueOrThrow({ where: { id: refundFirst } })).status, "REVIEW");
    assert.equal((await db.workspace.findUniqueOrThrow({ where: { id: workspace } })).paidUntil?.getTime(), first.paidUntil?.getTime());
    const upgrade = randomUUID(); providerId = "ORDER111222333"; captureId = "CAPTURE111222333"; localId = upgrade; amountValue = "2.00";
    await db.paymentOrder.create({ data: { id: upgrade, workspaceId: workspace, plan: "PRO", amount: 200, status: "PENDING", provider: "PAYPAL_SANDBOX", paymentLinkId: providerId, upgradeFromPaidUntil: first.paidUntil } });
    await service.reconcile(workspace, user, upgrade);
    const upgraded = await db.workspace.findUniqueOrThrow({ where: { id: workspace } });
    assert.equal(upgraded.paidPlan, "PRO"); assert.ok(upgraded.usageResetAt);
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    await db.paymentOrder.deleteMany({ where: { workspaceId: workspace } });
    await db.workspace.deleteMany({ where: { id: workspace } });
    await db.user.deleteMany({ where: { id: user } });
    await db.$disconnect();
  }
});
