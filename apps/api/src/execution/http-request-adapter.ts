import type { NodeResult } from "./node-executor-contract";
import { applyHttpCredential, HttpCredentialError } from "./http-credential";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound, fetchSafeOutboundWrite } from "./outbound-url-policy";
import { readBoundedProviderText } from "./provider-json";
import { isReadOnlyMethod, requireProviderSuccess, uncertainDelivery } from "./provider-request-policy";

export async function executeHttpRequest(config: Record<string, unknown>, credential?: Record<string, unknown>): Promise<NodeResult> {
  let url = typeof config.url === "string" ? config.url : "";
  if (!/^https?:\/\//.test(url)) throw new NodeFailure("INVALID_CONFIGURATION", "HTTP request requires an http(s) URL.", false);
  const timeoutMs = typeof config.timeoutMs === "number" && config.timeoutMs > 0 ? Math.min(config.timeoutMs, 60_000) : 15_000;
  const method = typeof config.method === "string" ? config.method.toUpperCase() : "GET";
  const write = !isReadOnlyMethod(method);
  const headers = readHttpHeaders(config.headers);
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
    const response = await (write ? fetchSafeOutboundWrite : fetchSafeOutbound)(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
    await requireProviderSuccess(response, "HTTP request", write);
    let raw: string;
    try {
      raw = await readBoundedProviderText(response);
    } catch (reason) {
      if (write) throw uncertainDelivery("HTTP request", response.status);
      throw reason;
    }
    const responseBody: unknown = tryJson(raw);
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
