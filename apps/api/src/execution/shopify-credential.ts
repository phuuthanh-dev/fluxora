import { createHash } from "node:crypto";
import { fetchSafeOutboundWrite } from "./outbound-url-policy";
import { NodeFailure } from "./node-failure";
import { readProviderJson, requireProviderSuccess } from "./provider-request-policy";

const validValue = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max && /^[\x21-\x7e]+$/.test(value);
export function validShopifyCredential(data: Record<string, unknown>) {
  return typeof data.shop === "string" && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(data.shop) &&
    (validValue(data.token, 4096) || (validValue(data.clientId, 512) && validValue(data.clientSecret, 512)));
}

const cached = new Map<string, { token: string; expiresAt: number }>();
const pending = new Map<string, Promise<string>>();
/** Tokens remain in process memory and are keyed by a digest of the store and credentials. */
export async function resolveShopifyCredential(data: Record<string, unknown>, transport = fetchSafeOutboundWrite, now = Date.now()): Promise<Record<string, unknown>> {
  if (!validShopifyCredential(data)) throw new NodeFailure("CREDENTIAL_INVALID", "Shopify connection is invalid.", false);
  if (validValue(data.token, 4096)) return data;
  const key = createHash("sha256").update(JSON.stringify([data.shop, data.clientId, data.clientSecret])).digest("hex");
  const previous = cached.get(key);
  if (previous && previous.expiresAt > now) return { shop: data.shop, token: previous.token };
  let request = pending.get(key);
  if (!request) {
    request = (async () => {
      let response: Response;
      try {
        response = await transport(`https://${data.shop}.myshopify.com/admin/oauth/access_token`, {
          method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type: "client_credentials", client_id: String(data.clientId), client_secret: String(data.clientSecret) }).toString(),
          signal: AbortSignal.timeout(15_000),
        });
      } catch { throw new NodeFailure("SHOPIFY_AUTH_FAILED", "Shopify connection could not be authorized.", true); }
      await requireProviderSuccess(response, "Shopify", false, "SHOPIFY_AUTH_FAILED");
      const payload = await readProviderJson(response, "Shopify", false, 16_384);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Shopify returned an invalid authorization response.", false);
      const { access_token, expires_in } = payload as Record<string, unknown>;
      if (!validValue(access_token, 4096) || typeof expires_in !== "number" || !Number.isFinite(expires_in) || expires_in <= 60 || expires_in > 172800 || access_token === data.clientSecret || access_token === data.clientId) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Shopify returned an invalid authorization response.", false);
      if (cached.size >= 100) cached.delete(cached.keys().next().value!);
      cached.set(key, { token: access_token, expiresAt: Date.now() + (expires_in - 60) * 1000 });
      return access_token;
    })();
    pending.set(key, request);
    void request.finally(() => pending.delete(key)).catch(() => undefined);
  }
  return { shop: data.shop, token: await request };
}
