import { ServiceUnavailableException } from "@nestjs/common";

type PaidPlan = "STARTER" | "PRO";
export type PayPalConfig = { clientId: string; secret: string; prices: Record<PaidPlan, number>; apiBase?: string; webhookId?: string };

// Live is disabled until the merchant, webhook and owner-approved USD prices are configured.
export function payPalLiveConfig(forCheckout = true): PayPalConfig | null {
  const { PAYPAL_CLIENT_ID: clientId, PAYPAL_CLIENT_SECRET: secret, PAYPAL_WEBHOOK_ID: webhookId } = process.env;
  const starter = Number(process.env.PAYPAL_STARTER_CENTS), pro = Number(process.env.PAYPAL_PRO_CENTS);
  let validOrigin = false;
  try { const origin = new URL(process.env.WEB_ORIGIN ?? ""); validOrigin = origin.protocol === "https:" && origin.hostname !== "localhost"; } catch { /* invalid origin */ }
  if (process.env.NODE_ENV !== "production" || (forCheckout && (process.env.PAYPAL_CHECKOUT_ENABLED !== "true" || process.env.PLAN_LIMITS_ENABLED !== "true")) || !validOrigin || !clientId || !secret || !webhookId || ![starter, pro].every((v) => Number.isSafeInteger(v) && v > 0 && v <= 100000)) return null;
  return { clientId, secret, webhookId, prices: { STARTER: starter, PRO: pro }, apiBase: "https://api-m.paypal.com" };
}

// This trial is deliberately unavailable on production or non-local hosts.
export function payPalSandboxConfig(): PayPalConfig | null {
  let isolated = false;
  try {
    const origin = new URL(process.env.WEB_ORIGIN ?? ""), database = new URL(process.env.DATABASE_URL ?? "");
    isolated = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(origin.hostname) &&
      ["localhost", "127.0.0.1"].includes(database.hostname) && /^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(database.pathname);
  } catch { /* Missing origin or database. */ }
  const { PAYPAL_SANDBOX_CLIENT_ID: clientId, PAYPAL_SANDBOX_CLIENT_SECRET: secret } = process.env;
  const starter = Number(process.env.PAYPAL_SANDBOX_STARTER_CENTS), pro = Number(process.env.PAYPAL_SANDBOX_PRO_CENTS);
  if (!["test", "development"].includes(process.env.NODE_ENV ?? "") || !isolated || process.env.PAYPAL_SANDBOX_ENABLED !== "true" || process.env.PLAN_LIMITS_ENABLED !== "true" || !clientId || !secret || ![starter, pro].every((v) => Number.isSafeInteger(v) && v > 0 && v <= 100000)) return null;
  return { clientId, secret, prices: { STARTER: starter, PRO: pro }, webhookId: process.env.PAYPAL_SANDBOX_WEBHOOK_ID };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

async function request(config: PayPalConfig, path: string, options?: { body?: unknown; rawBody?: string; idempotencyKey?: string }) {
  const auth = await fetch(`${config.apiBase ?? "https://api-m.sandbox.paypal.com"}/v1/oauth2/token`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!auth.ok) throw new ServiceUnavailableException("Payment provider is temporarily unavailable.");
  const token = record(await auth.json());
  if (token?.token_type !== "Bearer" || typeof token.access_token !== "string" || !token.access_token) throw new Error("Invalid Sandbox authorization.");
  const response = await fetch(`${config.apiBase ?? "https://api-m.sandbox.paypal.com"}${path}`, {
    method: options?.body || options?.rawBody ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json", Prefer: "return=representation", ...(options?.idempotencyKey ? { "PayPal-Request-Id": options.idempotencyKey } : {}) },
    ...(options?.rawBody ? { body: options.rawBody } : options?.body ? { body: JSON.stringify(options.body) } : {}),
  });
  if (!response.ok) throw new ServiceUnavailableException("Payment confirmation is temporarily unavailable.");
  const data = record(await response.json());
  if (!data) throw new Error("Invalid Sandbox response.");
  return data;
}

export async function createPayPalOrder(config: PayPalConfig, orderId: string, amount: number, returnUrl?: string) {
  const order = await request(config, "/v2/checkout/orders", { idempotencyKey: orderId, body: {
    intent: "CAPTURE", purchase_units: [{ custom_id: orderId, amount: { currency_code: "USD", value: (amount / 100).toFixed(2) } }],
    payment_source: { paypal: { experience_context: { shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW", ...(returnUrl ? { return_url: returnUrl, cancel_url: returnUrl } : {}) } } },
  } });
  const links = Array.isArray(order.links) ? order.links : [];
  const link = links.map(record).find((item) => item?.rel === "payer-action" || item?.rel === "approve");
  let url: URL;
  try { url = new URL(typeof link?.href === "string" ? link.href : ""); } catch { throw new Error("Invalid Sandbox checkout."); }
  if (typeof order.id !== "string" || !/^[A-Z0-9]{10,32}$/.test(order.id) || url.protocol !== "https:" || !(config.apiBase === "https://api-m.paypal.com" ? ["www.paypal.com", "paypal.com"] : ["www.sandbox.paypal.com", "sandbox.paypal.com"]).includes(url.hostname)) throw new Error("Invalid Sandbox checkout.");
  return { id: order.id, url: url.toString() };
}

export async function getPayPalOrder(config: PayPalConfig, providerOrderId: string) {
  if (!/^[A-Z0-9]{10,32}$/.test(providerOrderId)) throw new Error("Invalid Sandbox order.");
  return request(config, `/v2/checkout/orders/${providerOrderId}`);
}

export async function capturePayPalOrder(config: PayPalConfig, providerOrderId: string, orderId: string) {
  if (!/^[A-Z0-9]{10,32}$/.test(providerOrderId)) throw new Error("Invalid Sandbox order.");
  return request(config, `/v2/checkout/orders/${providerOrderId}/capture`, { idempotencyKey: `fluxora-${orderId}`, body: {} });
}

export function matchesPayPalOrder(value: unknown, expected: { providerOrderId: string; orderId: string; amount: number }) {
  const order = record(value), units = order?.purchase_units;
  const unit = Array.isArray(units) && units.length === 1 ? record(units[0]) : null;
  const amount = record(unit?.amount);
  return order?.id === expected.providerOrderId && order.intent === "CAPTURE" && unit?.custom_id === expected.orderId &&
    amount?.currency_code === "USD" && amount.value === (expected.amount / 100).toFixed(2);
}

export function matchesPayPalCapture(value: unknown, expected: { providerOrderId: string; orderId: string; amount: number }) {
  const order = record(value), units = order?.purchase_units;
  const unit = Array.isArray(units) && units.length === 1 ? record(units[0]) : null;
  const payments = record(unit?.payments), captures = payments?.captures;
  const capture = Array.isArray(captures) && captures.length === 1 ? record(captures[0]) : null;
  const amount = record(capture?.amount);
  return matchesPayPalOrder(value, expected) && order?.status === "COMPLETED" &&
    capture?.status === "COMPLETED" && amount?.currency_code === "USD" && amount.value === (expected.amount / 100).toFixed(2);
}

export function payPalCaptureId(value: unknown): string | null {
  const units = record(value)?.purchase_units;
  const unit = Array.isArray(units) && units.length === 1 ? record(units[0]) : null;
  const captures = record(unit?.payments)?.captures;
  const capture = Array.isArray(captures) && captures.length === 1 ? record(captures[0]) : null;
  return typeof capture?.id === "string" && /^[A-Z0-9]{10,32}$/.test(capture.id) ? capture.id : null;
}

export async function verifyPayPalWebhook(config: PayPalConfig, raw: Buffer | undefined, headers: Record<string, string | undefined>) {
  if (!config.webhookId || !raw || raw.length > 256_000 || !headers.authAlgo || !headers.certUrl || !headers.transmissionId || !headers.transmissionSig || !headers.transmissionTime) return false;
  try {
    const cert = new URL(headers.certUrl);
    const hosts = config.apiBase === "https://api-m.paypal.com" ? ["api.paypal.com", "api-m.paypal.com"] : ["api.sandbox.paypal.com", "api-m.sandbox.paypal.com"];
    if (cert.protocol !== "https:" || !hosts.includes(cert.hostname) || !cert.pathname.startsWith("/v1/notifications/certs/") || cert.username || cert.password || cert.port) return false;
  } catch { return false; }
  const event = raw.toString("utf8");
  try { JSON.parse(event); } catch { return false; }
  const metadata = JSON.stringify({ auth_algo: headers.authAlgo, cert_url: headers.certUrl, transmission_id: headers.transmissionId, transmission_sig: headers.transmissionSig, transmission_time: headers.transmissionTime, webhook_id: config.webhookId });
  const response = await request(config, "/v1/notifications/verify-webhook-signature", { rawBody: `${metadata.slice(0, -1)},"webhook_event":${event}}` });
  return response.verification_status === "SUCCESS";
}

export function readPayPalEvent(value: unknown) {
  const event = record(value), resource = record(event?.resource), data = record(resource?.supplementary_data), ids = record(data?.related_ids);
  if (event?.event_type !== "CHECKOUT.ORDER.APPROVED" && event?.event_type !== "PAYMENT.CAPTURE.COMPLETED" && event?.event_type !== "PAYMENT.CAPTURE.REFUNDED") return null;
  const candidate = event.event_type === "CHECKOUT.ORDER.APPROVED" ? resource?.id : ids?.order_id;
  const orderId = typeof candidate === "string" && /^[A-Z0-9]{10,32}$/.test(candidate) ? candidate : null;
  let captureId = typeof ids?.capture_id === "string" && /^[A-Z0-9]{10,32}$/.test(ids.capture_id) ? ids.capture_id : null;
  if (!captureId && event.event_type === "PAYMENT.CAPTURE.REFUNDED" && Array.isArray(resource?.links)) {
    const up = resource.links.map(record).find((link) => link?.rel === "up" && typeof link.href === "string");
    try {
      const url = new URL(String(up?.href));
      if (url.protocol === "https:" && ["api.paypal.com", "api-m.paypal.com", "api.sandbox.paypal.com", "api-m.sandbox.paypal.com"].includes(url.hostname)) captureId = /^\/v2\/payments\/captures\/([A-Z0-9]{10,32})$/.exec(url.pathname)?.[1] ?? null;
    } catch { /* Invalid or absent capture link is left for reconciliation. */ }
  }
  return { orderId, captureId, refunded: event.event_type === "PAYMENT.CAPTURE.REFUNDED" };
}
