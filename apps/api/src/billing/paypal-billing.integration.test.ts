import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { BillingService } from "./billing.service";
import { WorkspaceService } from "../workspaces/workspace.service";

test("PayPal confirmation, duplicate webhook and refund preserve one entitlement", { skip: process.env.FLUXORA_PLAN_INTEGRATION !== "1" }, async () => {
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(database.hostname) || !/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(database.pathname)) throw new Error("Requires an isolated local test database.");
  const keys = ["NODE_ENV", "WEB_ORIGIN", "PLAN_LIMITS_ENABLED", "PAYPAL_SANDBOX_ENABLED", "PAYPAL_SANDBOX_CLIENT_ID", "PAYPAL_SANDBOX_CLIENT_SECRET", "PAYPAL_SANDBOX_STARTER_CENTS", "PAYPAL_SANDBOX_PRO_CENTS", "PAYPAL_SANDBOX_WEBHOOK_ID", "PLATFORM_ADMIN_USER_ID"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { NODE_ENV: "test", WEB_ORIGIN: "http://localhost:3400", PLAN_LIMITS_ENABLED: "true", PAYPAL_SANDBOX_ENABLED: "true", PAYPAL_SANDBOX_CLIENT_ID: "test", PAYPAL_SANDBOX_CLIENT_SECRET: "test", PAYPAL_SANDBOX_STARTER_CENTS: "100", PAYPAL_SANDBOX_PRO_CENTS: "200", PAYPAL_SANDBOX_WEBHOOK_ID: "test" });
  const previousFetch = globalThis.fetch, db = new PrismaClient(), suffix = randomUUID(), user = `paypal-${suffix}`, workspace = `paypal-${suffix}`, clearedWorkspace = `paypal-cleared-${suffix}`, raceWorkspace = `paypal-race-${suffix}`;
  let approved = false, captured = false, captureFailure = false, localId = "", captures = 0, expectedWorkspace = workspace;
  let providerId = "ORDER123456789";
  let captureId = "CAPTURE123456789", amountValue = "1.00";
  const remote = () => ({ id: providerId, intent: "CAPTURE", status: captured ? "COMPLETED" : approved ? "APPROVED" : "CREATED", purchase_units: [{ custom_id: localId, amount: { currency_code: "USD", value: amountValue }, ...(captured ? { payments: { captures: [{ id: captureId, status: "COMPLETED", amount: { currency_code: "USD", value: amountValue } }] } } : {}) }] });
  globalThis.fetch = async (url, options) => {
    const path = String(url);
    if (path.endsWith("/token")) return Response.json({ token_type: "Bearer", access_token: "test" });
    if (path.endsWith("/verify-webhook-signature")) return Response.json({ verification_status: "SUCCESS" });
    if (path.endsWith("/v2/checkout/orders")) {
      const body = JSON.parse(String(options?.body));
      localId = body.purchase_units[0].custom_id;
      const returnUrl = new URL(body.payment_source.paypal.experience_context.return_url);
      assert.equal(returnUrl.origin, "http://localhost:3400");
      assert.equal(returnUrl.pathname, "/dashboard/plan");
      assert.equal(returnUrl.searchParams.get("workspace"), expectedWorkspace);
      assert.equal(returnUrl.searchParams.get("order"), localId);
      assert.equal(returnUrl.searchParams.get("payment"), "return");
      const cancelUrl = new URL(body.payment_source.paypal.experience_context.cancel_url);
      assert.equal(cancelUrl.origin, returnUrl.origin);
      assert.equal(cancelUrl.pathname, returnUrl.pathname);
      assert.equal(cancelUrl.searchParams.get("workspace"), expectedWorkspace);
      assert.equal(cancelUrl.searchParams.get("order"), null);
      assert.equal(cancelUrl.searchParams.get("payment"), "cancel");
      return Response.json({ ...remote(), links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=test" }] });
    }
    if (path.endsWith("/capture")) { assert.equal(approved, true); captures++; if (captureFailure) return new Response(null, { status: 503 }); captured = true; }
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

    // A manually closed order cannot capture a delayed approval or block a new checkout.
    await db.workspace.create({ data: { id: clearedWorkspace, name: "Test", slug: `paypal-cleared-${suffix}`, ownerId: user, members: { create: { userId: user, role: "OWNER" } } } });
    const reviewed = randomUUID(), reviewedProviderId = "ORDERREVIEWED123";
    await db.paymentOrder.create({ data: { id: reviewed, workspaceId: clearedWorkspace, plan: "STARTER", amount: 100, status: "PENDING", provider: "PAYPAL", paymentLinkId: reviewedProviderId, checkoutUrl: "https://www.paypal.com/checkoutnow" } });
    process.env.PLATFORM_ADMIN_USER_ID = user;
    await assert.rejects(service.closeReviewedPayPalOrder(reviewed, reviewedProviderId, "other"), /Administrator/);
    await assert.rejects(service.closeReviewedPayPalOrder(reviewed, "WRONGORDER123", user), /support review/);
    assert.equal((await db.paymentOrder.findUniqueOrThrow({ where: { id: reviewed } })).status, "PENDING");
    for (const change of [{ providerOrderId: "CAPTUREEXISTS123" }, { paidAt: new Date() }, { providerRefundedAt: new Date() }]) {
      await db.paymentOrder.update({ where: { id: reviewed }, data: change });
      await assert.rejects(service.closeReviewedPayPalOrder(reviewed, reviewedProviderId, user), /support review/);
      await db.paymentOrder.update({ where: { id: reviewed }, data: { providerOrderId: null, paidAt: null, providerRefundedAt: null } });
    }
    process.env.PLATFORM_ADMIN_USER_ID = "nonexistent-admin";
    await assert.rejects(service.closeReviewedPayPalOrder(reviewed, reviewedProviderId, "nonexistent-admin"));
    assert.equal((await db.paymentOrder.findUniqueOrThrow({ where: { id: reviewed } })).status, "PENDING");
    process.env.PLATFORM_ADMIN_USER_ID = user;
    await service.closeReviewedPayPalOrder(reviewed, reviewedProviderId, user);
    const reviewedOrder = await db.paymentOrder.findUniqueOrThrow({ where: { id: reviewed } });
    assert.equal(reviewedOrder.status, "EXPIRED"); assert.equal(reviewedOrder.checkoutUrl, null);
    assert.equal(await db.auditLog.count({ where: { targetId: reviewed, action: "billing.paypal_order_manually_closed", actorId: user } }), 1);
    await assert.rejects(service.closeReviewedPayPalOrder(reviewed, reviewedProviderId, user), /support review/);
    assert.equal(await service.latest(clearedWorkspace, user), null);

    // A capture claim and an operator closure cannot both win on the same order.
    await db.workspace.create({ data: { id: raceWorkspace, name: "Test", slug: `paypal-race-${suffix}`, ownerId: user } });
    const racingOrder = randomUUID(), racingProviderId = "ORDERRACING12345";
    await db.paymentOrder.create({ data: { id: racingOrder, workspaceId: raceWorkspace, plan: "STARTER", amount: 100, status: "PENDING", provider: "PAYPAL", paymentLinkId: racingProviderId } });
    const [closure, claim] = await Promise.allSettled([
      service.closeReviewedPayPalOrder(racingOrder, racingProviderId, user),
      db.paymentOrder.updateMany({ where: { id: racingOrder, status: "PENDING", paymentLinkId: racingProviderId }, data: { status: "REVIEW" } }),
    ]);
    assert.equal(claim.status, "fulfilled");
    const claimWon = claim.status === "fulfilled" && claim.value.count === 1;
    assert.notEqual(closure.status === "fulfilled", claimWon);
    assert.equal((await db.paymentOrder.findUniqueOrThrow({ where: { id: racingOrder } })).status, claimWon ? "REVIEW" : "EXPIRED");
    const closed = randomUUID(); providerId = "ORDERCLOSED12345"; localId = closed; amountValue = "1.00"; approved = true; captured = false;
    await db.paymentOrder.create({ data: { id: closed, workspaceId: clearedWorkspace, plan: "STARTER", amount: 100, status: "EXPIRED", provider: "PAYPAL_SANDBOX", paymentLinkId: providerId } });
    const lateApproval = Buffer.from(JSON.stringify({ event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: providerId } }));
    const priorCaptures = captures;
    await assert.rejects(service.handlePayPalWebhook(lateApproval, headers), /support review/);
    assert.equal(captures, priorCaptures);
    assert.equal((await db.paymentOrder.findUniqueOrThrow({ where: { id: closed } })).status, "EXPIRED");
    providerId = "ORDERNEW12345678"; captureId = "CAPTURENEW123456"; approved = false; expectedWorkspace = clearedWorkspace;
    const newCheckout = await service.createCheckout(clearedWorkspace, user, "STARTER", undefined, undefined, "paypal-sandbox");
    assert.notEqual(newCheckout.orderId, closed);
    approved = true;
    const newApproval = Buffer.from(JSON.stringify({ event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: providerId } }));
    await service.handlePayPalWebhook(newApproval, headers);
    assert.equal(captures, priorCaptures + 1);
    assert.equal((await db.workspace.findUniqueOrThrow({ where: { id: clearedWorkspace } })).paidPlan, "STARTER");

    // A lost/failed capture response keeps checkout blocked for manual review.
    const uncertain = randomUUID(); providerId = "ORDERUNCERTAIN123"; localId = uncertain; approved = true; captured = false; captureFailure = true;
    await db.paymentOrder.create({ data: { id: uncertain, workspaceId: clearedWorkspace, plan: "STARTER", amount: 100, status: "PENDING", provider: "PAYPAL_SANDBOX", paymentLinkId: providerId } });
    const uncertainApproval = Buffer.from(JSON.stringify({ event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: providerId } }));
    await assert.rejects(service.handlePayPalWebhook(uncertainApproval, headers));
    assert.equal((await db.paymentOrder.findUniqueOrThrow({ where: { id: uncertain } })).status, "REVIEW");
    await assert.rejects(service.createCheckout(clearedWorkspace, user, "STARTER", undefined, undefined, "paypal-sandbox"), /reconciliation/);
  } finally {
    globalThis.fetch = previousFetch;
    for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    await db.auditLog.deleteMany({ where: { workspaceId: { in: [clearedWorkspace, raceWorkspace] } } });
    await db.paymentOrder.deleteMany({ where: { workspaceId: { in: [workspace, clearedWorkspace, raceWorkspace] } } });
    await db.workspace.deleteMany({ where: { id: { in: [workspace, clearedWorkspace, raceWorkspace] } } });
    await db.user.deleteMany({ where: { id: user } });
    await db.$disconnect();
  }
});
