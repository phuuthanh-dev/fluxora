import { Agent } from "undici";
import { createSafeSocketLookup, assertSafeOutboundUrl } from "./outbound-url-policy";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { readBoundedProviderJson } from "./provider-json";

export type ObservabilityTransport = (url: string, init: RequestInit) => Promise<Response>;
const dispatcher = new Agent({ connect: { lookup: createSafeSocketLookup() } });

// Unlike the generic outbound client, these operations do not follow redirects.
export const observabilityTransport: ObservabilityTransport = async (url, init) => {
  const target = await assertSafeOutboundUrl(url);
  return fetch(target, { ...init, redirect: "manual", dispatcher } as unknown as RequestInit);
};

export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
export function token(credential: Record<string, unknown>, provider: string) {
  const value = credential.token;
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,512}$/.test(value)) throw new NodeFailure("CREDENTIAL_INVALID", `${provider} connection requires a valid access token.`, false);
  return value;
}
export async function getJson(url: string, accessToken: string, provider: string, transport: ObservabilityTransport) {
  let response: Response;
  try {
    response = await transport(url, { method: "GET", redirect: "manual", headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  } catch (error) { throw nodeFailureFromOutboundPolicy(error); }
  if (!response.ok) throw new NodeFailure("HTTP_ERROR", `${provider} returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
  try { return { data: await readBoundedProviderJson(response), headers: response.headers }; }
  catch (error) { if (error instanceof NodeFailure) throw error; throw new NodeFailure("INVALID_RESPONSE", `${provider} returned an invalid response.`, false); }
}
