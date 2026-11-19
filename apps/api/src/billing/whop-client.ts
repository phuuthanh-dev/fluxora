import { ServiceUnavailableException } from "@nestjs/common";

type PaidPlan = "STARTER" | "PRO";
export type WhopConfig = { apiKey: string; signingSecret: string; accountId: string; variants: Record<PaidPlan, string>; apiBase: string; checkoutHost: string };

// Production and Sandbox have separate credentials, hosts and opt-in flags.
export function whopConfig(forExistingPayments = false): WhopConfig | null {
  const production = process.env.NODE_ENV === "production";
  const prefix = production ? "WHOP" : "WHOP_SANDBOX";
  const apiKey = process.env[`${prefix}_API_KEY`], signingSecret = process.env[`${prefix}_WEBHOOK_SECRET`], accountId = process.env[`${prefix}_ACCOUNT_ID`], starter = process.env[`${prefix}_STARTER_VARIANT_ID`], pro = process.env[`${prefix}_PRO_VARIANT_ID`];
  let localOrigin = false;
  try { localOrigin = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(process.env.WEB_ORIGIN ?? "").hostname); } catch { /* No configured local origin. */ }
  if ((production ? !forExistingPayments && process.env.WHOP_CHECKOUT_ENABLED !== "true" : !localOrigin || process.env.WHOP_SANDBOX_ENABLED !== "true") || process.env.PLAN_LIMITS_ENABLED !== "true" || !apiKey || !signingSecret?.startsWith("ws_") || !accountId || !/^biz_[a-zA-Z0-9]+$/.test(accountId) || !starter || !pro || starter === pro || ![starter, pro].every((id) => /^plan_[a-zA-Z0-9]+$/.test(id))) return null;
  return { apiKey, signingSecret, accountId, variants: { STARTER: starter, PRO: pro }, apiBase: production ? "https://api.whop.com/api/v1" : "https://sandbox-api.whop.com/api/v1", checkoutHost: production ? "whop.com" : "sandbox.whop.com" };
}

async function request(config: WhopConfig, path: string, body?: object, idempotencyKey?: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${config.apiBase}/${path}`, {
    method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${config.apiKey}`, "Api-Version-Date": "2026-11-14-1", ...(body ? { "Content-Type": "application/json" } : {}), ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new ServiceUnavailableException("Payment provider is temporarily unavailable.");
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Invalid provider response.");
  return result as Record<string, unknown>;
}

export async function createWhopCheckout(config: WhopConfig, input: { plan: PaidPlan; amount: number; orderId: string; nonce: string; redirectUrl: string }) {
  const variant = config.variants[input.plan];
  // Whop rejects HTTP redirects, including localhost. In the isolated local
  // sandbox the customer returns manually after completing the test checkout.
  const redirect = new URL(input.redirectUrl);
  const checkout = await request(config, "checkout_configurations", { account_id: config.accountId, variant_id: variant, mode: "payment", ...(redirect.protocol === "https:" ? { redirect_url: redirect.toString() } : {}), metadata: { fluxora_order_id: input.orderId, fluxora_nonce: input.nonce } }, input.orderId);
  const offer = checkout.variant as Record<string, unknown> | null;
  const url = typeof checkout.purchase_url === "string" ? new URL(checkout.purchase_url) : null;
  if (typeof checkout.id !== "string" || !/^ch_[a-zA-Z0-9]+$/.test(checkout.id) || checkout.account_id !== config.accountId || checkout.mode !== "payment" || !offer || offer.id !== variant || offer.billing_type !== "one_time" || offer.currency !== "vnd" || offer.initial_price !== input.amount || !url || url.protocol !== "https:" || url.hostname !== config.checkoutHost || !url.pathname.startsWith("/checkout/")) throw new Error("Invalid provider checkout.");
  return { id: checkout.id, url: url.toString() };
}

export async function getWhopPayment(config: WhopConfig, id: string) {
  if (!/^pay_[a-zA-Z0-9]+$/.test(id)) throw new Error("Invalid payment identifier.");
  return request(config, `payments/${id}`);
}
