import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { normalizeShopifyOrder, verifyShopifySignature } from "./shopify-trigger-protocol";

const secret = "synthetic-shopify-signing-secret";
const body = Buffer.from(JSON.stringify({ admin_graphql_api_id: "gid://shopify/Order/123", name: "#1001", created_at: "2026-01-01T00:00:00Z", email: "private@example.test", customer: { phone: "private" } }));

test("Shopify signs the raw bytes and normalizes only the fields required by the trigger", () => {
  const signature = createHmac("sha256", secret).update(body).digest("base64");
  assert.equal(verifyShopifySignature(body, signature, secret), true);
  assert.equal(verifyShopifySignature(Buffer.concat([body, Buffer.from(" ")]), signature, secret), false);
  assert.equal(verifyShopifySignature(body, signature, "wrong-secret"), false);
  assert.equal(verifyShopifySignature(body, "invalid", secret), false);
  const event = normalizeShopifyOrder(body, secret);
  assert.equal(event.orderId, "123");
  assert.deepEqual(event.payload, { source: "shopify", event: "orders/create", orderId: "gid://shopify/Order/123", orderName: "#1001", createdAt: "2026-01-01T00:00:00Z" });
  assert.ok(!JSON.stringify(event).includes("private"));
});

test("Shopify rejects malformed events and accidental secret echoes", () => {
  assert.throws(() => normalizeShopifyOrder(Buffer.from("{}"), secret));
  assert.throws(() => normalizeShopifyOrder(Buffer.from(JSON.stringify({ admin_graphql_api_id: "gid://shopify/Order/123", name: secret, created_at: "2026-01-01" })), secret));
});
