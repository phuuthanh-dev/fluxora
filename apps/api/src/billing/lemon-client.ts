import { ServiceUnavailableException } from "@nestjs/common";

type PaidPlan = "STARTER" | "PRO";
type LemonConfig = { apiKey: string; signingSecret: string; storeId: string; storeHost: string; variants: Record<PaidPlan, string>; testMode: boolean };
type ApiObject = { data?: { id?: string; attributes?: Record<string, unknown> } };

export function lemonConfig(): LemonConfig | null {
  const { LEMON_API_KEY: apiKey, LEMON_SIGNING_SECRET: signingSecret, LEMON_STORE_ID: storeId, LEMON_STORE_HOST: storeHost, LEMON_STARTER_VARIANT_ID: starter, LEMON_PRO_VARIANT_ID: pro } = process.env;
  const testMode = process.env.LEMON_TEST_MODE === "true";
  if (!apiKey || !signingSecret || !storeId || !storeHost || !starter || !pro || ![storeId, starter, pro].every((id) => /^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && Number(id) > 0) || starter === pro || !/^[a-z0-9-]+\.lemonsqueezy\.com$/.test(storeHost) || (testMode && process.env.NODE_ENV === "production")) return null;
  return { apiKey, signingSecret, storeId, storeHost, variants: { STARTER: starter, PRO: pro }, testMode };
}

export function lemonCheckoutEnabled() {
  return process.env.LEMON_CHECKOUT_ENABLED === "true" && process.env.PLAN_LIMITS_ENABLED === "true" && Boolean(lemonConfig());
}

async function lemonRequest(config: LemonConfig, path: string, body?: unknown): Promise<ApiObject> {
  const response = await fetch(`https://api.lemonsqueezy.com/v1/${path}`, {
    method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${config.apiKey}`, Accept: "application/vnd.api+json", ...(body ? { "Content-Type": "application/vnd.api+json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new ServiceUnavailableException("Payment provider is temporarily unavailable.");
  return await response.json() as ApiObject;
}

export async function createLemonCheckout(config: LemonConfig, input: { plan: PaidPlan; amount: number; orderId: string; workspaceId: string; nonce: string; webOrigin: string }) {
  const variantId = config.variants[input.plan];
  const variant = await lemonRequest(config, `variants/${variantId}`);
  const attrs = variant.data?.attributes;
  if (variant.data?.id !== variantId || attrs?.price !== input.amount * 100 || attrs.test_mode !== config.testMode || attrs.is_subscription !== false || !Number.isSafeInteger(attrs.product_id)) throw new Error("Invalid payment product configuration.");
  const product = await lemonRequest(config, `products/${attrs.product_id}`);
  if (product.data?.attributes?.store_id !== Number(config.storeId) || product.data.attributes.test_mode !== config.testMode || product.data.attributes.status !== "published") throw new Error("Invalid payment product configuration.");
  const redirectUrl = new URL("/dashboard/plan", input.webOrigin);
  redirectUrl.searchParams.set("workspace", input.workspaceId); redirectUrl.searchParams.set("order", input.orderId); redirectUrl.searchParams.set("payment", "return");
  const checkout = await lemonRequest(config, "checkouts", { data: { type: "checkouts", attributes: {
    test_mode: config.testMode, expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    product_options: { enabled_variants: [Number(variantId)], redirect_url: redirectUrl.toString() },
    checkout_options: { discount: false }, checkout_data: { variant_quantities: [{ variant_id: Number(variantId), quantity: 1 }], custom: { fluxora_order_id: input.orderId, fluxora_nonce: input.nonce } },
  }, relationships: { store: { data: { type: "stores", id: config.storeId } }, variant: { data: { type: "variants", id: variantId } } } } });
  const response = checkout.data; const url = typeof response?.attributes?.url === "string" ? new URL(response.attributes.url) : null;
  if (!response?.id || response.attributes?.test_mode !== config.testMode || !url || url.protocol !== "https:" || url.hostname !== config.storeHost) throw new Error("Invalid payment checkout.");
  return { id: response.id, url: url.toString() };
}

export async function getLemonOrder(config: LemonConfig, id: string) {
  if (!/^\d{1,20}$/.test(id)) throw new Error("Invalid payment identifier.");
  return lemonRequest(config, `orders/${id}`);
}

export async function hasOneLemonOrderItem(config: LemonConfig, id: string): Promise<boolean> {
  if (!/^\d{1,20}$/.test(id)) return false;
  const response = await fetch(`https://api.lemonsqueezy.com/v1/order-items?filter%5Border_id%5D=${id}`, { headers: { Authorization: `Bearer ${config.apiKey}`, Accept: "application/vnd.api+json" }, redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new ServiceUnavailableException("Payment provider is temporarily unavailable.");
  const body = await response.json() as { data?: unknown; meta?: { page?: { total?: unknown } } };
  return Array.isArray(body.data) && body.data.length === 1 && body.meta?.page?.total === 1;
}
