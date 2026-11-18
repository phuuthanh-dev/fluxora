import { createHmac, timingSafeEqual } from "node:crypto";

/** Accept only a canonical Shopify-owned store hostname. */
export function shopifyShop(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 77 || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/.test(value)) return undefined;
  return value;
}

/** Match Shopify's Admin HMAC canonicalization, including URL encoding. */
export function verifyShopifyOAuthQuery(query: URLSearchParams, clientSecret: string): boolean {
  if (!clientSecret || query.size > 20) return false;
  const entries = [...query.entries()];
  const names = new Set(entries.map(([name]) => name));
  if (names.size !== entries.length || entries.some(([name, value]) => !name || name.length > 128 || value.length > 4096)) return false;
  const supplied = query.get("hmac");
  if (!supplied || !/^[a-f0-9]{64}$/.test(supplied)) return false;
  const message = new URLSearchParams(entries.filter(([name]) => name !== "hmac" && name !== "signature").sort(([a], [b]) => a.localeCompare(b))).toString().replace(/\+/g, "%20");
  const expected = createHmac("sha256", clientSecret).update(message).digest();
  return timingSafeEqual(expected, Buffer.from(supplied, "hex"));
}
