import { nodeConfigIssues } from "@workflow/contracts";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure } from "./node-failure";
import { fetchSafeOutbound, fetchSafeOutboundWrite, wasOutboundRedirected } from "./outbound-url-policy";
import { assertNoCredentialInProviderValue } from "./provider-credential-safety";
import { readProviderJson, uncertainDelivery } from "./provider-request-policy";

type Operation = "create" | "get" | "update";
type Transport = (url: string, init: RequestInit) => Promise<Response>;

/** Create is blank by API design; updates explicitly append or replace text. */
export async function executeGoogleDocs(config: Record<string, unknown>, operation: Operation, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport?: Transport) {
  const issue = nodeConfigIssues(`action.google-docs.${operation}`, config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_INPUT", issue.message, false);
  const documentId = typeof config.documentId === "string" ? config.documentId : "";
  const title = typeof config.title === "string" ? config.title.trim() : "";
  if (mode === "mock") return { status: "succeeded" as const, output: operation === "update" ? { documentId, updated: true } : { document: { documentId: documentId || "mock-document", title: title || "Example document", ...(operation === "get" ? { body: { content: [] } } : {}) } }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId.trim() : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Google connection.", false);
  const credential = await credentials.readGoogleForExecution(credentialId, workspaceId);
  const token = credential.accessToken;
  if (typeof token !== "string" || !token || token.length > 4096 || /\s/.test(token)) throw new NodeFailure("CREDENTIAL_INVALID", "Google connection is invalid.", false);
  assertNoCredentialInProviderValue(config, token);
  const write = operation !== "get";
  const url = operation === "create" ? "https://docs.googleapis.com/v1/documents" : `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}${operation === "update" ? ":batchUpdate" : "?includeTabsContent=true"}`;
  const body = operation === "create" ? { title } : operation === "update" ? { requests: [config.operation === "replace" ? { replaceAllText: { containsText: { text: config.find, matchCase: true }, replaceText: config.text } } : { insertText: { endOfSegmentLocation: {}, text: config.text } }] } : undefined;
  let response: Response;
  try { response = await (transport ?? (write ? fetchSafeOutboundWrite : fetchSafeOutbound))(url, { method: write ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, ...(write ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000) }); }
  catch { if (write) throw uncertainDelivery("Google Docs"); throw new NodeFailure("GOOGLE_DOCS_UNAVAILABLE", "Google Docs could not be reached.", true); }
  if (!response.ok || wasOutboundRedirected(response)) {
    await response.body?.cancel().catch(() => undefined);
    if (write && (wasOutboundRedirected(response) || response.status === 408 || response.status === 429 || response.status >= 500 || response.status >= 300 && response.status < 400)) throw uncertainDelivery("Google Docs", response.status);
    throw new NodeFailure("GOOGLE_DOCS_ERROR", `Google Docs returned ${response.status}.`, !write && (response.status === 429 || response.status >= 500), response.status);
  }
  const result = await readProviderJson(response, "Google Docs", write, 1_000_000);
  if (!result || typeof result !== "object" || Array.isArray(result)) { if (write) throw uncertainDelivery("Google Docs", response.status); throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Google Docs returned an invalid document.", false); }
  assertNoCredentialInProviderValue(result, token);
  const data = result as Record<string, unknown>;
  if (operation === "update" && data.documentId !== documentId) throw uncertainDelivery("Google Docs", response.status);
  if (operation !== "update" && (typeof data.documentId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(data.documentId) || (operation === "get" && data.documentId !== documentId))) {
    if (write) throw uncertainDelivery("Google Docs", response.status);
    throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Google Docs returned an invalid document.", false);
  }
  return { status: "succeeded" as const, output: operation === "update" ? { documentId, updated: true } : { document: data }, route: "success" as const };
}
