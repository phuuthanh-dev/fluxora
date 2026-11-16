import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function verifyWhopWebhook(raw: Buffer | undefined, id: string | undefined, timestamp: string | undefined, signatures: string | undefined, secret: string | undefined, now = Date.now()): boolean {
  if (!raw || !id || !/^msg_[a-zA-Z0-9]+$/.test(id) || !timestamp || !/^\d{1,12}$/.test(timestamp) || Math.abs(now - Number(timestamp) * 1000) > 300_000 || !signatures || !secret?.startsWith("ws_")) return false;
  const expected = createHmac("sha256", secret).update(`${id}.${timestamp}.`).update(raw).digest();
  return signatures.split(" ").some((part) => {
    const [version, signature] = part.split(",");
    if (version !== "v1" || !signature || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
    const actual = Buffer.from(signature, "base64");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

export function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function readWhopPaymentEvent(payload: unknown, accountId: string) {
  const event = record(payload), data = record(event?.data), metadata = record(data?.metadata);
  if (event?.type !== "payment.succeeded" || event.account_id !== accountId || data?.account_id !== accountId || typeof data.id !== "string" || !/^pay_[a-zA-Z0-9]+$/.test(data.id) || typeof metadata?.fluxora_order_id !== "string" || !/^[0-9a-f-]{36}$/i.test(metadata.fluxora_order_id) || typeof metadata.fluxora_nonce !== "string" || !/^[a-f0-9]{64}$/.test(metadata.fluxora_nonce)) return null;
  return { paymentId: data.id, orderId: metadata.fluxora_order_id, nonce: metadata.fluxora_nonce };
}

export function readWhopRefundEvent(payload: unknown, accountId: string): string | null {
  const event = record(payload), data = record(event?.data), payment = record(data?.payment);
  const paymentId = payment?.id;
  return event?.type === "refund.created" && (event.account_id === accountId || event.company_id === accountId) && typeof paymentId === "string" && /^pay_[a-zA-Z0-9]+$/.test(paymentId) ? paymentId : null;
}

export function matchesWhopPayment(payment: unknown, expected: { paymentId: string; accountId: string; checkoutId: string; variantId: string; orderId: string; nonceHash: string; amount: number; taxIncluded?: boolean }): boolean {
  const value = record(payment), meta = record(value?.metadata), subtotal = record(value?.subtotal), total = record(value?.total), refunded = record(value?.refunded_amount);
  const items = value?.line_items;
  if (typeof meta?.fluxora_nonce !== "string" || !/^[a-f0-9]{64}$/.test(meta.fluxora_nonce) || !/^[a-f0-9]{64}$/.test(expected.nonceHash)) return false;
  if (!timingSafeEqual(createHash("sha256").update(meta.fluxora_nonce).digest(), Buffer.from(expected.nonceHash, "hex"))) return false;
  const subtotalAmount = typeof subtotal?.amount === "string" && /^\d+$/.test(subtotal.amount) ? Number(subtotal.amount) : NaN;
  const totalAmount = typeof total?.amount === "string" && /^\d+$/.test(total.amount) ? Number(total.amount) : NaN;
  const amountMatches = expected.taxIncluded ? totalAmount === expected.amount && subtotalAmount > 0 && subtotalAmount <= totalAmount : subtotalAmount === expected.amount && totalAmount >= expected.amount;
  return value?.id === expected.paymentId && value.account_id === expected.accountId && value.checkout_configuration_id === expected.checkoutId && value.status === "paid" && value.substatus === "succeeded" && value.currency === "vnd" && value.variant_id === expected.variantId && value.promo_code_id == null && value.refunded_at == null && meta.fluxora_order_id === expected.orderId && subtotal?.currency === "vnd" && total?.currency === "vnd" && amountMatches && refunded?.currency === "vnd" && typeof refunded.amount === "string" && Number(refunded.amount) === 0 && Array.isArray(items) && items.length === 1 && record(items[0])?.quantity === 1 && record(items[0])?.variant_id === expected.variantId;
}
