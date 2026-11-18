import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { shopifyShop, verifyShopifyOAuthQuery } from "./shopify-oauth-protocol";

test("Shopify OAuth verifies the canonical callback and rejects tampering or duplicate parameters", () => {
  const secret = "synthetic-client-secret";
  const params = new URLSearchParams({ shop: "example-shop.myshopify.com", code: "code", state: "state +/%", timestamp: "1760000000" });
  const message = new URLSearchParams([...params.entries()].sort(([a], [b]) => a.localeCompare(b))).toString().replace(/\+/g, "%20");
  params.set("hmac", createHmac("sha256", secret).update(message).digest("hex"));
  assert.equal(verifyShopifyOAuthQuery(params, secret), true);
  assert.equal(verifyShopifyOAuthQuery(params, "wrong"), false);
  const tampered = new URLSearchParams(params); tampered.set("shop", "other.myshopify.com");
  assert.equal(verifyShopifyOAuthQuery(tampered, secret), false);
  const duplicate = new URLSearchParams(params); duplicate.append("shop", "other.myshopify.com");
  assert.equal(verifyShopifyOAuthQuery(duplicate, secret), false);
});

test("Shopify OAuth only accepts canonical myshopify.com domains", () => {
  assert.equal(shopifyShop("example-shop.myshopify.com"), "example-shop.myshopify.com");
  for (const value of ["example-shop", "https://example-shop.myshopify.com", "example.myshopify.com.evil.test", "-bad.myshopify.com", "EXAMPLE.myshopify.com", "a.b.myshopify.com"]) assert.equal(shopifyShop(value), undefined);
});
