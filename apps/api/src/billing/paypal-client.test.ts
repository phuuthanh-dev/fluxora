import assert from "node:assert/strict";
import test from "node:test";
import { matchesPayPalCapture, matchesPayPalOrder, payPalSandboxConfig, payPalLiveConfig, payPalCaptureId, readPayPalEvent, verifyPayPalWebhook } from "./paypal-client";

test("PayPal trial is restricted to an explicitly enabled isolated local test database", () => {
  const keys = ["NODE_ENV", "WEB_ORIGIN", "DATABASE_URL", "PAYPAL_SANDBOX_ENABLED", "PLAN_LIMITS_ENABLED", "PAYPAL_SANDBOX_CLIENT_ID", "PAYPAL_SANDBOX_CLIENT_SECRET", "PAYPAL_SANDBOX_STARTER_CENTS", "PAYPAL_SANDBOX_PRO_CENTS"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, { NODE_ENV: "test", WEB_ORIGIN: "http://localhost:3400", DATABASE_URL: "postgresql://localhost/fluxora_paypal_test", PAYPAL_SANDBOX_ENABLED: "true", PLAN_LIMITS_ENABLED: "true", PAYPAL_SANDBOX_CLIENT_ID: "test", PAYPAL_SANDBOX_CLIENT_SECRET: "test", PAYPAL_SANDBOX_STARTER_CENTS: "100", PAYPAL_SANDBOX_PRO_CENTS: "200" });
    assert.ok(payPalSandboxConfig());
    process.env.NODE_ENV = "production"; assert.equal(payPalSandboxConfig(), null);
    process.env.NODE_ENV = "test"; process.env.DATABASE_URL = "postgresql://localhost/fluxora"; assert.equal(payPalSandboxConfig(), null);
    process.env.DATABASE_URL = "postgresql://remote/fluxora_paypal_test"; assert.equal(payPalSandboxConfig(), null);
    process.env.DATABASE_URL = "postgresql://localhost/fluxora_paypal_test"; process.env.WEB_ORIGIN = "https://fluxora.io.vn"; assert.equal(payPalSandboxConfig(), null);
  } finally {
    for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
});

test("disabling live checkout keeps verification available for existing orders", () => {
  const keys = ["NODE_ENV", "WEB_ORIGIN", "PLAN_LIMITS_ENABLED", "PAYPAL_CHECKOUT_ENABLED", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "PAYPAL_STARTER_CENTS", "PAYPAL_PRO_CENTS"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    Object.assign(process.env, { NODE_ENV: "production", WEB_ORIGIN: "https://example.test", PLAN_LIMITS_ENABLED: "true", PAYPAL_CHECKOUT_ENABLED: "false", PAYPAL_CLIENT_ID: "test", PAYPAL_CLIENT_SECRET: "test", PAYPAL_WEBHOOK_ID: "test", PAYPAL_STARTER_CENTS: "388", PAYPAL_PRO_CENTS: "779" });
    assert.equal(payPalLiveConfig(), null);
    assert.ok(payPalLiveConfig(false));
    process.env.PAYPAL_CHECKOUT_ENABLED = "true";
    assert.ok(payPalLiveConfig());
    delete process.env.PAYPAL_WEBHOOK_ID;
    assert.equal(payPalLiveConfig(), null);
  } finally { for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
});

test("PayPal capture requires matching order, reference, currency and settled amount", () => {
  const expected = { providerOrderId: "ABC123456789", orderId: "local-order", amount: 100 };
  const makeOrder = () => ({ id: expected.providerOrderId, intent: "CAPTURE", status: "COMPLETED", purchase_units: [{ custom_id: expected.orderId, amount: { currency_code: "USD", value: "1.00" }, payments: { captures: [{ id: "CAP123456789", status: "COMPLETED", amount: { currency_code: "USD", value: "1.00" } }] } }] });
  const order = makeOrder(); assert.equal(matchesPayPalOrder(order, expected), true); assert.equal(matchesPayPalCapture(order, expected), true);
  const wrongReference = makeOrder(); wrongReference.purchase_units[0]!.custom_id = "other"; assert.equal(matchesPayPalCapture(wrongReference, expected), false);
  const wrongCurrency = makeOrder(); wrongCurrency.purchase_units[0]!.payments.captures[0]!.amount.currency_code = "EUR"; assert.equal(matchesPayPalCapture(wrongCurrency, expected), false);
  const pending = makeOrder(); pending.purchase_units[0]!.payments.captures[0]!.status = "PENDING"; assert.equal(matchesPayPalCapture(pending, expected), false);
  const wrongAmount = makeOrder(); wrongAmount.purchase_units[0]!.amount.value = "2.00"; assert.equal(matchesPayPalCapture(wrongAmount, expected), false);
  assert.equal(payPalCaptureId(order), "CAP123456789");
});

test("webhook verification posts the original event to PayPal and fails closed", async () => {
  const previous = globalThis.fetch;
  const raw = Buffer.from('{ "event_type": "PAYMENT.CAPTURE.COMPLETED", "resource": {} }');
  const config = { clientId: "test", secret: "test", prices: { STARTER: 100, PRO: 200 }, webhookId: "TESTHOOK" };
  const headers = { authAlgo: "SHA256withRSA", certUrl: "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-TEST", transmissionId: "id", transmissionSig: "signature", transmissionTime: "2026-01-01T00:00:00Z" };
  try {
    globalThis.fetch = async (url, init) => {
      assert.ok(String(url).startsWith("https://api-m.sandbox.paypal.com/"));
      if (String(url).endsWith("/token")) return Response.json({ token_type: "Bearer", access_token: "test" });
      assert.ok(String(init?.body).includes(raw.toString()));
      return Response.json({ verification_status: "SUCCESS" });
    };
    assert.equal(await verifyPayPalWebhook(config, raw, headers), true);
    assert.equal(await verifyPayPalWebhook(config, raw, { ...headers, transmissionSig: undefined }), false);
    assert.equal(await verifyPayPalWebhook(config, raw, { ...headers, certUrl: "https://attacker.example/v1/notifications/certs/test" }), false);
    globalThis.fetch = async (url) => String(url).endsWith("/token") ? Response.json({ token_type: "Bearer", access_token: "test" }) : Response.json({ verification_status: "FAILURE" });
    assert.equal(await verifyPayPalWebhook(config, raw, headers), false);
    assert.equal(readPayPalEvent({ event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { supplementary_data: { related_ids: { order_id: "ORDER12345678" } } } })?.refunded, true);
  } finally { globalThis.fetch = previous; }
});
