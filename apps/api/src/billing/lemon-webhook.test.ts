import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { matchesLemonPaidOrder, readLemonOrderEvent, verifyLemonWebhook } from "./lemon-webhook";

test("Lemon webhook checks the signature against the raw body", () => {
  const secret = "test-only-signing-secret", body = Buffer.from('{"a":1}');
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifyLemonWebhook(body, signature, secret), true);
  assert.equal(verifyLemonWebhook(Buffer.from('{ "a":1}'), signature, secret), false);
  assert.equal(verifyLemonWebhook(body, "not-a-digest", secret), false);
  assert.equal(verifyLemonWebhook(body, signature, undefined), false);
});

test("Lemon webhook extracts only a bounded order event with its local correlation", () => {
  const payload = { meta: { event_name: "order_created", custom_data: { fluxora_order_id: "a1b2c3d4-1234-1234-1234-123456789abc", fluxora_nonce: "a".repeat(64) } }, data: { type: "orders", id: "123" } };
  assert.deepEqual(readLemonOrderEvent(payload), { event: "order_created", providerOrderId: "123", localOrderId: payload.meta.custom_data.fluxora_order_id, nonce: "a".repeat(64) });
  assert.equal(readLemonOrderEvent({ ...payload, meta: { ...payload.meta, event_name: "subscription_created" } }), null);
  assert.equal(readLemonOrderEvent({ ...payload, data: { type: "orders", id: "../123" } }), null);
  assert.equal(readLemonOrderEvent({ ...payload, meta: { ...payload.meta, custom_data: {} } }), null);
  assert.equal(readLemonOrderEvent({ ...payload, meta: { ...payload.meta, custom_data: { ...payload.meta.custom_data, fluxora_order_id: "-".repeat(36) } } }), null);
});

test("provider order matching checks the listed item price rather than the converted order total", () => {
  const expected = { orderId: "123", storeId: 7, variantId: 9, priceVnd: 99000, testMode: true };
  const attributes = { store_id: 7, test_mode: true, status: "paid", refunded: false, currency: "VND", discount_total: 0, total_usd: 386, total: 9905055, first_order_item: { order_id: 123, variant_id: 9, quantity: 1, price: 9900000, test_mode: true } };
  const order = (overrides: Record<string, unknown>) => ({ data: { type: "orders", id: "123", attributes: { ...attributes, ...overrides } } });
  assert.equal(matchesLemonPaidOrder(order({}), expected), true);
  for (const mismatch of [{ status: "pending" }, { test_mode: false }, { store_id: 8 }, { currency: "USD" }, { refunded: true }, { discount_total: 1 }, { total_usd: 0 }, { first_order_item: { ...attributes.first_order_item, price: 1 } }, { first_order_item: { ...attributes.first_order_item, quantity: 2 } }, { first_order_item: { ...attributes.first_order_item, variant_id: 10 } }]) {
    assert.equal(matchesLemonPaidOrder(order(mismatch), expected), false);
  }
  assert.equal(matchesLemonPaidOrder(order({}), { ...expected, orderId: "124" }), false);
});
