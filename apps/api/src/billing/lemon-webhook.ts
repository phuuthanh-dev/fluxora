import { createHmac, timingSafeEqual } from "node:crypto";

/** Verify the exact bytes sent by Lemon Squeezy before parsing the event. */
export function verifyLemonWebhook(rawBody: Buffer | undefined, signature: string | undefined, secret: string | undefined): boolean {
  if (!rawBody || !secret || !signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const actual = Buffer.from(signature, "hex");
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

export interface LemonOrderEvent {
  event: "order_created" | "order_refunded";
  providerOrderId: string;
  localOrderId: string;
  nonce: string;
}

/** Extract only routing information; the provider order must still be checked independently. */
export function readLemonOrderEvent(payload: unknown): LemonOrderEvent | null {
  const body = record(payload), meta = record(body?.meta), custom = record(meta?.custom_data), data = record(body?.data);
  const event = meta?.event_name;
  if ((event !== "order_created" && event !== "order_refunded") || data?.type !== "orders") return null;
  const providerOrderId = data.id, localOrderId = custom?.fluxora_order_id, nonce = custom?.fluxora_nonce;
  if (typeof providerOrderId !== "string" || !/^\d{1,20}$/.test(providerOrderId)) return null;
  if (typeof localOrderId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(localOrderId)) return null;
  if (typeof nonce !== "string" || !/^[a-f0-9]{64}$/.test(nonce)) return null;
  return { event, providerOrderId, localOrderId, nonce };
}

/** Match provider-fetched order details, not the webhook's untrusted body. */
export function matchesLemonPaidOrder(payload: unknown, expected: { orderId: string; storeId: number; variantId: number; priceVnd: number; testMode: boolean }): boolean {
  const body = record(payload), data = record(body?.data), attributes = record(data?.attributes), item = record(attributes?.first_order_item);
  if (!Number.isSafeInteger(expected.priceVnd) || expected.priceVnd <= 0 || expected.priceVnd > Math.floor(Number.MAX_SAFE_INTEGER / 100)) return false;
  return data?.type === "orders" && data.id === expected.orderId && attributes?.store_id === expected.storeId &&
    attributes.test_mode === expected.testMode && attributes.status === "paid" && attributes.refunded === false &&
    attributes.currency === "VND" && attributes.discount_total === 0 && typeof attributes.total_usd === "number" && Number.isSafeInteger(attributes.total_usd) && attributes.total_usd > 0 && item?.variant_id === expected.variantId &&
    String(item.order_id) === expected.orderId && item.quantity === 1 && item.price === expected.priceVnd * 100 && item.test_mode === expected.testMode;
}
