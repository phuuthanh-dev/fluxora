export function validShopifyCredential(data: Record<string, unknown>) {
  return typeof data.shop === "string" && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(data.shop) && typeof data.token === "string" && data.token.length > 0 && data.token.length <= 4096 && /^[\x21-\x7e]+$/.test(data.token);
}
