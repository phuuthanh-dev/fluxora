import assert from "node:assert/strict";
import test from "node:test";
import { resolveShopifyCredential, validShopifyCredential } from "./shopify-credential";
import { NodeFailure } from "./node-failure";

test("Shopify custom app obtains and reacquires a bounded access token", async () => {
  const data = { shop: "fixture-renew", clientId: "fixture-id", clientSecret: "fixture-secret" };
  let calls = 0;
  const transport = async (url: string, init: RequestInit = {}) => {
    calls++;
    assert.equal(url, "https://fixture-renew.myshopify.com/admin/oauth/access_token");
    assert.equal(new URLSearchParams(String(init.body)).get("grant_type"), "client_credentials");
    return Response.json({ access_token: `fixture-token-${calls}`, expires_in: 3600 });
  };
  const [first, concurrent] = await Promise.all([resolveShopifyCredential(data, transport), resolveShopifyCredential(data, transport)]);
  assert.deepEqual(first, { shop: data.shop, token: "fixture-token-1" });
  assert.deepEqual(concurrent, first);
  assert.equal(calls, 1);
  assert.deepEqual(await resolveShopifyCredential(data, transport), first);
  assert.deepEqual(await resolveShopifyCredential(data, transport, Date.now() + 3_600_000), { shop: data.shop, token: "fixture-token-2" });
  assert.equal(calls, 2);
});

test("Shopify authorization errors are actionable, safe and not retried as transient failures", async () => {
  for (const status of [400, 401, 403]) {
    await assert.rejects(resolveShopifyCredential({ shop: `fixture-auth-${status}`, clientId: "id", clientSecret: "secret" }, async () => new Response("private provider body", { status })), (error: unknown) => error instanceof NodeFailure && error.code === "SHOPIFY_AUTH_FAILED" && error.message === "Shopify connection could not be authorized." && !error.retryable && !error.message.includes("private provider body"));
  }
  await assert.rejects(resolveShopifyCredential({ shop: "fixture-auth-rate", clientId: "id", clientSecret: "secret" }, async () => new Response("private provider body", { status: 429 })), (error: unknown) => error instanceof NodeFailure && error.retryable && !error.message.includes("private provider body"));
});

test("Shopify preserves manual tokens and rejects unsafe credentials and malformed token responses", async () => {
  assert.deepEqual(await resolveShopifyCredential({ shop: "fixture", token: "manual-token" }), { shop: "fixture", token: "manual-token" });
  assert.equal(validShopifyCredential({ shop: "fixture.myshopify.com.evil.test", clientId: "id", clientSecret: "secret" }), false);
  assert.equal(validShopifyCredential({ shop: "fixture", clientId: "id", clientSecret: "" }), false);
  await assert.rejects(resolveShopifyCredential({ shop: "fixture-invalid", clientId: "id", clientSecret: "secret" }, async () => Response.json({ access_token: "x", expires_in: -1 })), /invalid authorization response/i);
  await assert.rejects(resolveShopifyCredential({ shop: "fixture-fail", clientId: "id", clientSecret: "secret" }, async () => new Response("private provider body", { status: 401 })), (error: unknown) => error instanceof Error && !error.message.includes("private provider body"));
});
