import { NodeFailure } from "./node-failure";
import { readBoundedProviderJson } from "./provider-json";
import { wasOutboundRedirected } from "./outbound-url-policy";

export function isReadOnlyMethod(method = "GET") {
  return ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export function uncertainDelivery(provider: string, statusCode?: number) {
  return new NodeFailure("DELIVERY_UNCERTAIN", `${provider} may have applied the request. Check the provider before running it again.`, false, statusCode);
}

export async function requireProviderSuccess(response: Response, provider: string, write: boolean, code = "HTTP_ERROR") {
  if (response.ok) return;
  // Error bodies can contain secrets and have no useful execution output.
  await response.body?.cancel().catch(() => undefined);
  if (write && (response.status === 408 || response.status >= 500 || (response.status >= 300 && response.status < 400) || wasOutboundRedirected(response))) throw uncertainDelivery(provider, response.status);
  throw new NodeFailure(code, `${provider} returned ${response.status}.`, response.status === 429 || (!write && response.status >= 500), response.status);
}

export async function readProviderJson(response: Response, provider: string, write = false): Promise<unknown> {
  try {
    return await readBoundedProviderJson(response);
  } catch (reason) {
    if (write) throw uncertainDelivery(provider, response.status);
    if (reason instanceof NodeFailure) throw reason;
    if (reason instanceof SyntaxError || !response.body) {
      throw new NodeFailure("INVALID_PROVIDER_RESPONSE", `${provider} returned an invalid response.`, false);
    }
    throw new NodeFailure("NETWORK_ERROR", `${provider} response could not be read.`, true);
  }
}
