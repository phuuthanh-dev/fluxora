/** Accept only a canonical Shopify-owned store hostname. */
export function shopifyShop(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 77 || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/.test(value)) return undefined;
  return value;
}
