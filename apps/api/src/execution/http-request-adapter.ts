import type { NodeResult } from "./node-executor-contract";
import { applyHttpCredential, httpCredentialSecrets, HttpCredentialError } from "./http-credential";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound, fetchSafeOutboundWrite } from "./outbound-url-policy";
import { readBoundedProviderText } from "./provider-json";
import { isReadOnlyMethod, requireProviderSuccess, uncertainDelivery } from "./provider-request-policy";

export async function executeHttpRequest(config: Record<string, unknown>, credential?: Record<string, unknown>, transport?: (url: string, init: RequestInit) => Promise<Response>): Promise<NodeResult> {
  const request = readHttpRequestConfig(config);
  let url = request.url;
  const timeoutMs = typeof config.timeoutMs === "number" && config.timeoutMs > 0 ? Math.min(config.timeoutMs, 60_000) : 15_000;
  const method = typeof config.method === "string" ? config.method.toUpperCase() : "GET";
  const write = !isReadOnlyMethod(method);
  const headers = request.headers;
  if (credential) {
    try {
      const authenticated = applyHttpCredential(url, headers, credential);
      url = authenticated.url;
      Object.assign(headers, authenticated.headers);
    } catch (reason) {
      throw new NodeFailure("CREDENTIAL_INVALID", reason instanceof HttpCredentialError ? reason.message : "HTTP credential could not be used.", false);
    }
  }
  const body = method === "GET" || method === "HEAD" ? undefined : requestBody(config.body, headers);
  try {
    const response = await (transport ?? (write ? fetchSafeOutboundWrite : fetchSafeOutbound))(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
    await requireProviderSuccess(response, "HTTP request", write);
    let raw: string;
    try {
      raw = await readBoundedProviderText(response);
    } catch (reason) {
      if (write) throw uncertainDelivery("HTTP request", response.status);
      throw reason;
    }
    const responseBody: unknown = tryJson(raw);
    if (credential && containsCredentialEcho(raw, responseBody, httpCredentialSecrets(credential))) {
      // A write may already have succeeded. Never expose the provider's
      // response or retry it automatically when the receipt is unsafe.
      if (write) throw uncertainDelivery("HTTP request", response.status);
      throw new NodeFailure("HTTP_RESPONSE_UNSAFE", "HTTP response cannot be stored safely. Check the provider response and connection.", false);
    }
    return { status: "succeeded", output: { status: response.status, body: responseBody }, route: "success" };
  } catch (reason) {
    if (reason instanceof NodeFailure) throw reason;
    const policyFailure = nodeFailureFromOutboundPolicy(reason);
    if (policyFailure.code === "OUTBOUND_URL_BLOCKED" || (!write && policyFailure.code === "OUTBOUND_REDIRECT_BLOCKED")) throw policyFailure;
    if (write) throw uncertainDelivery("HTTP request");
    const timeout = reason instanceof Error && reason.name === "TimeoutError";
    throw new NodeFailure(timeout ? "TIMEOUT" : "NETWORK_ERROR", timeout ? "HTTP request timed out." : "HTTP request failed.", true);
  }
}

export function readHttpRequestConfig(config: Record<string, unknown>) {
  const url = typeof config.url === "string" ? config.url : "";
  if (!/^https?:\/\//.test(url)) throw new NodeFailure("INVALID_CONFIGURATION", "HTTP request requires an http(s) URL.", false);
  try { new URL(url); } catch { throw new NodeFailure("INVALID_CONFIGURATION", "HTTP request requires an http(s) URL.", false); }
  return { url, headers: readHttpHeaders(config.headers) };
}

function containsCredentialEcho(raw: string, body: unknown, secrets: string[]): boolean {
  if (!secrets.length) return false;
  const pending: unknown[] = [raw, body];
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === "string") {
      if (secrets.some((secret) => item.includes(secret))) return true;
    } else if (Array.isArray(item)) { for (const value of item) pending.push(value); }
    else if (item && typeof item === "object") {
      for (const [key, value] of Object.entries(item)) pending.push(key, value);
    }
  }
  return false;
}

function readHttpHeaders(value: unknown) {
  if (value === undefined) return {} as Record<string, string>;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new NodeFailure("INVALID_CONFIGURATION", "HTTP headers must be a JSON object.", false);
  const headers: Record<string, string> = {};
  for (const [name, headerValue] of Object.entries(value)) {
    if (typeof headerValue !== "string") throw new NodeFailure("INVALID_CONFIGURATION", "HTTP header values must be strings.", false);
    headers[name] = headerValue;
  }
  return headers;
}

function requestBody(value: unknown, headers: Record<string, string>) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string") return value;
  if (!Object.keys(headers).some((name) => name.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json";
  return JSON.stringify(value);
}

function tryJson(value: string): unknown {
  try { return JSON.parse(value) as unknown; } catch { return value; }
}
