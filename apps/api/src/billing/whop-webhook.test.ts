import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";
import { matchesWhopPayment, readWhopPaymentEvent, verifyWhopWebhook } from "./whop-webhook";

test("Whop verifies raw bytes, event identity, timestamp and rotated signatures", () => {
  const secret = "ws_test_secret", now = Date.now(), timestamp = String(Math.floor(now / 1000)), id = "msg_example1", raw = Buffer.from('{"type":"payment.succeeded"}');
  const signature = createHmac("sha256", secret).update(`${id}.${timestamp}.`).update(raw).digest("base64");
  assert.equal(verifyWhopWebhook(raw, id, timestamp, `v1,${signature}`, secret, now), true);
  assert.equal(verifyWhopWebhook(raw, id, timestamp, `v1,${Buffer.alloc(32).toString("base64")} v1,${signature}`, secret, now), true);
  assert.equal(verifyWhopWebhook(Buffer.from("{}"), id, timestamp, `v1,${signature}`, secret, now), false);
  assert.equal(verifyWhopWebhook(raw, id, timestamp, `v1,${signature}`, secret, now + 301_000), false);
  assert.equal(verifyWhopWebhook(raw, id, timestamp, "v1,invalid", secret, now), false);
});

test("Whop payment correlation requires its account, offer, amount, checkout and nonce", () => {
  const nonce = "b".repeat(64), orderId = "a1b2c3d4-1234-1234-1234-123456789abc", nonceHash = createHash("sha256").update(nonce).digest("hex");
  const payment = { id: "pay_test1", account_id: "biz_test1", checkout_configuration_id: "ch_test1", status: "paid", substatus: "succeeded", currency: "vnd", variant_id: "plan_test1", metadata: { fluxora_order_id: orderId, fluxora_nonce: nonce }, subtotal: { amount: "99000", currency: "vnd" }, total: { amount: "108900", currency: "vnd" }, refunded_amount: { amount: "0", currency: "vnd" }, line_items: [{ quantity: 1, variant_id: "plan_test1" }] };
  const expected = { paymentId: payment.id, accountId: payment.account_id, checkoutId: payment.checkout_configuration_id, variantId: payment.variant_id, orderId, nonceHash, amount: 99000 };
  assert.equal(matchesWhopPayment(payment, expected), true);
  const inclusive = { ...payment, subtotal: { amount: "90000", currency: "vnd" }, total: { amount: "99000", currency: "vnd" } };
  assert.equal(matchesWhopPayment(inclusive, { ...expected, taxIncluded: true }), true);
  assert.equal(matchesWhopPayment(payment, { ...expected, taxIncluded: true }), false);
  for (const altered of [{ ...payment, account_id: "biz_other" }, { ...payment, checkout_configuration_id: "ch_other" }, { ...payment, status: "pending" }, { ...payment, total: { amount: "50000", currency: "vnd" } }, { ...payment, refunded_amount: { amount: "1", currency: "vnd" } }, { ...payment, promo_code_id: "promo_1" }, { ...payment, metadata: { ...payment.metadata, fluxora_nonce: "c".repeat(64) } }]) assert.equal(matchesWhopPayment(altered, expected), false);
  assert.equal(readWhopPaymentEvent({ type: "payment.succeeded", account_id: payment.account_id, data: payment }, payment.account_id)?.orderId, orderId);
  assert.equal(readWhopPaymentEvent({ type: "payment.succeeded", account_id: "biz_other", data: payment }, payment.account_id), null);
});
