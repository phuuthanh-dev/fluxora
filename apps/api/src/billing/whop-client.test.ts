import assert from "node:assert/strict";
import test from "node:test";
import { createWhopCheckout, whopConfig } from "./whop-client";

test("Whop creates only a matching sandbox checkout and never enables on production", async () => {
  const settings: Record<string, string> = { NODE_ENV: "test", WEB_ORIGIN: "http://localhost:3000", WHOP_SANDBOX_ENABLED: "true", PLAN_LIMITS_ENABLED: "true", WHOP_SANDBOX_API_KEY: "fake", WHOP_SANDBOX_WEBHOOK_SECRET: "ws_test", WHOP_SANDBOX_ACCOUNT_ID: "biz_test1", WHOP_SANDBOX_STARTER_VARIANT_ID: "plan_starter", WHOP_SANDBOX_PRO_VARIANT_ID: "plan_pro" };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]])); Object.assign(process.env, settings);
  const oldFetch = globalThis.fetch;
  let price = 99000;
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "https://sandbox-api.whop.com/api/v1/checkout_configurations");
    assert.equal((init?.headers as Record<string, string>)["Idempotency-Key"], "order1");
    assert.equal(JSON.parse(String(init?.body)).metadata.fluxora_order_id, "order1");
    assert.equal(JSON.parse(String(init?.body)).redirect_url, undefined);
    return Response.json({ id: "ch_test1", account_id: "biz_test1", mode: "payment", purchase_url: "https://sandbox.whop.com/checkout/ch_test1/", variant: { id: "plan_starter", billing_type: "one_time", currency: "vnd", initial_price: price } });
  };
  try {
    const config = whopConfig()!;
    const input = { plan: "STARTER" as const, amount: 99000, orderId: "order1", nonce: "b".repeat(64), redirectUrl: "http://localhost:3000/dashboard/plan" };
    assert.equal((await createWhopCheckout(config, input)).id, "ch_test1");
    price = 1; await assert.rejects(createWhopCheckout(config, input), /Invalid provider checkout/);
    process.env.NODE_ENV = "production"; assert.equal(whopConfig(), null);
    process.env.NODE_ENV = "test"; process.env.WEB_ORIGIN = "https://fluxora.io.vn"; assert.equal(whopConfig(), null);
  } finally {
    globalThis.fetch = oldFetch; for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
