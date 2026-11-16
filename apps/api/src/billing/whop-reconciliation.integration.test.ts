import assert from "node:assert/strict";
import { createHash, createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { BillingService } from "./billing.service";
import { WorkspaceService } from "../workspaces/workspace.service";

test("Whop duplicate and retried Sandbox payments grant exactly one upgrade", { skip: process.env.FLUXORA_PLAN_INTEGRATION !== "1" }, async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Whop integration requires an isolated local test database.");
  const settings: Record<string, string> = { NODE_ENV: "test", WEB_ORIGIN: "http://localhost:3000", WHOP_SANDBOX_ENABLED: "true", PLAN_LIMITS_ENABLED: "true", WHOP_SANDBOX_API_KEY: "fake", WHOP_SANDBOX_WEBHOOK_SECRET: "ws_test", WHOP_SANDBOX_ACCOUNT_ID: "biz_test1", WHOP_SANDBOX_STARTER_VARIANT_ID: "plan_starter", WHOP_SANDBOX_PRO_VARIANT_ID: "plan_pro" };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]])); Object.assign(process.env, settings);
  const oldFetch = globalThis.fetch, db = new PrismaClient(), suffix = randomUUID(), user = `whop-${suffix}`, workspace = `whop-space-${suffix}`, orderId = randomUUID(), refundOrderId = randomUUID(), nonce = "b".repeat(64);
  const hash = createHash("sha256").update(nonce).digest("hex"), oldPaidUntil = new Date(Date.now() + 10 * 86400000);
  let unavailable = true;
  const payment = (id: string) => ({ id, account_id: "biz_test1", checkout_configuration_id: "ch_test1", status: "paid", substatus: "succeeded", currency: "vnd", variant_id: "plan_pro", metadata: { fluxora_order_id: orderId, fluxora_nonce: nonce }, subtotal: { amount: "199000", currency: "vnd" }, total: { amount: "218900", currency: "vnd" }, refunded_amount: { amount: "0", currency: "vnd" }, line_items: [{ quantity: 1, variant_id: "plan_pro" }] });
  globalThis.fetch = async (input) => { if (unavailable) return new Response(null, { status: 503 }); const id = String(input).split("/").pop()!; return Response.json(id === "pay_refund1" ? { ...payment(id), metadata: { fluxora_order_id: refundOrderId, fluxora_nonce: nonce } } : payment(id)); };
  function event(id: string, message: string) { const timestamp = String(Math.floor(Date.now() / 1000)), payload = { id: message, type: "payment.succeeded", account_id: "biz_test1", data: payment(id) }, raw = Buffer.from(JSON.stringify(payload)); return { id: message, timestamp, payload, raw, signature: `v1,${createHmac("sha256", settings.WHOP_SANDBOX_WEBHOOK_SECRET!).update(`${message}.${timestamp}.`).update(raw).digest("base64")}` }; }
  try {
    await db.user.create({ data: { id: user, email: `${suffix}@example.test` } });
    await db.workspace.create({ data: { id: workspace, name: "Test", slug: `whop-${suffix}`, ownerId: user, paidPlan: "STARTER", paidUntil: oldPaidUntil, members: { create: { userId: user, role: "OWNER" } } } });
    await db.paymentOrder.create({ data: { id: orderId, workspaceId: workspace, plan: "PRO", amount: 199000, status: "PENDING", provider: "WHOP", providerNonceHash: hash, paymentLinkId: "ch_test1", upgradeFromPaidUntil: oldPaidUntil } });
    const service = new BillingService(db as never, new WorkspaceService(db as never)), first = event("pay_test1", "msg_test1");
    await assert.rejects(service.handleWhopWebhook(first.raw, first.id, first.timestamp, first.signature, first.payload), /temporarily unavailable/);
    assert.equal((await db.whopPayment.findUniqueOrThrow({ where: { providerOrderId: "pay_test1" } })).status, "PENDING");
    unavailable = false; const before = Date.now();
    await Promise.all([service.reconcile(workspace, user, orderId), service.handleWhopWebhook(first.raw, first.id, first.timestamp, first.signature, first.payload)]);
    const upgraded = await db.workspace.findUniqueOrThrow({ where: { id: workspace } });
    assert.equal(upgraded.paidPlan, "PRO"); assert.ok(upgraded.usageResetAt && upgraded.usageResetAt.getTime() >= before);
    assert.ok(upgraded.paidUntil && upgraded.paidUntil.getTime() >= before + 30 * 86400000 && upgraded.paidUntil.getTime() <= Date.now() + 30 * 86400000);
    const duplicate = event("pay_test2", "msg_test2");
    await service.handleWhopWebhook(duplicate.raw, duplicate.id, duplicate.timestamp, duplicate.signature, duplicate.payload);
    assert.equal((await db.whopPayment.findUniqueOrThrow({ where: { providerOrderId: "pay_test2" } })).reason, "DUPLICATE");
    assert.equal((await db.workspace.findUniqueOrThrow({ where: { id: workspace } })).paidUntil?.getTime(), upgraded.paidUntil!.getTime());
    await db.paymentOrder.create({ data: { id: refundOrderId, workspaceId: workspace, plan: "PRO", amount: 199000, status: "PENDING", provider: "WHOP", providerNonceHash: hash, paymentLinkId: "ch_refund1" } });
    const timestamp = String(Math.floor(Date.now() / 1000)), id = "msg_refund1", payload = { id, type: "refund.created", account_id: "biz_test1", data: { payment: { id: "pay_refund1" } } }, raw = Buffer.from(JSON.stringify(payload));
    const signature = `v1,${createHmac("sha256", settings.WHOP_SANDBOX_WEBHOOK_SECRET!).update(`${id}.${timestamp}.`).update(raw).digest("base64")}`;
    await service.handleWhopWebhook(raw, id, timestamp, signature, payload);
    assert.equal((await db.whopPayment.findUniqueOrThrow({ where: { providerOrderId: "pay_refund1" } })).status, "REFUNDED");
    assert.equal((await db.paymentOrder.findUniqueOrThrow({ where: { id: refundOrderId } })).status, "REVIEW");
    assert.equal((await db.workspace.findUniqueOrThrow({ where: { id: workspace } })).paidUntil?.getTime(), upgraded.paidUntil!.getTime());
  } finally {
    globalThis.fetch = oldFetch; for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await db.whopPayment.deleteMany({ where: { paymentOrderId: { in: [orderId, refundOrderId] } } }); await db.paymentOrder.deleteMany({ where: { workspaceId: workspace } }); await db.workspace.deleteMany({ where: { id: workspace } }); await db.user.deleteMany({ where: { id: user } }); await db.$disconnect();
  }
});
