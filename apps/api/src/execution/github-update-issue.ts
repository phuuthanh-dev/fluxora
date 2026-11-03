import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { fetchSafeOutbound, fetchSafeOutboundWrite, wasOutboundRedirected } from "./outbound-url-policy";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { readProviderJson, requireProviderSuccess, uncertainDelivery } from "./provider-request-policy";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

/** Updates exactly one field. GitHub does not provide an atomic precondition
 * for this PATCH, so a concurrent edit can still be overwritten. */
export async function executeGitHubUpdateIssue(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, read: Transport = fetchSafeOutbound, write: Transport = fetchSafeOutboundWrite) {
  const repository = typeof config.repository === "string" ? config.repository.trim() : "";
  const parts = repository.split("/");
  const rawNumber = typeof config.issueNumber === "number" && Number.isSafeInteger(config.issueNumber) ? String(config.issueNumber) : typeof config.issueNumber === "string" ? config.issueNumber.trim() : "";
  if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_.-]{1,100}$/.test(part) || part === "." || part === "..") || !/^[1-9]\d*$/.test(rawNumber) || !Number.isSafeInteger(Number(rawNumber))) throw new NodeFailure("INVALID_CONFIGURATION", "Choose a valid repository and issue number.", false);
  if (Object.hasOwn(config, "field") && config.field === undefined) throw new NodeFailure("INVALID_CONFIGURATION", "The issue field could not be resolved.", false);
  const field = config.field ?? "title";
  if (field !== "title" && field !== "body" && field !== "state") throw new NodeFailure("INVALID_CONFIGURATION", "Choose an issue field to update.", false);
  const value = config[field];
  if (typeof value !== "string" || (field === "title" && (!value.trim() || value.trim().length > 256)) || (field === "body" && value.length > 65_536) || (field === "state" && value !== "open" && value !== "closed")) throw new NodeFailure("INVALID_CONFIGURATION", "Enter a valid value for the selected issue field.", false);
  const newValue = field === "title" ? value.trim() : value;
  const issueNumber = Number(rawNumber);
  const output = { repository, issueNumber, updatedField: field };
  if (mode === "mock") return { status: "succeeded" as const, output, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId.trim() : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a GitHub connection.", false);
  const credential = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.GITHUB);
  const token = typeof credential.token === "string" ? credential.token.trim() : "";
  if (!token || token.length > 4096 || /[^\x21-\x7e]/.test(token) || repository.includes(token)) throw new NodeFailure("CREDENTIAL_INVALID", "GitHub connection is invalid.", false);
  const url = `https://api.github.com/repos/${encodeURIComponent(parts[0]!)}/${encodeURIComponent(parts[1]!)}/issues/${rawNumber}`;
  const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Fluxora" };
  let response: Response;
  try { response = await read(url, { method: "GET", headers, signal: AbortSignal.timeout(15_000) }); }
  catch (error) { throw nodeFailureFromOutboundPolicy(error); }
  await requireProviderSuccess(response, "GitHub", false);
  const current = object(await readProviderJson(response, "GitHub"));
  if (!current || current.number !== issueNumber || current.pull_request !== undefined) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "The selected GitHub resource is not an issue.", false);
  try { response = await write(url, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ [field]: newValue }), signal: AbortSignal.timeout(15_000) }); }
  catch { throw uncertainDelivery("GitHub"); }
  if (wasOutboundRedirected(response) || (response.status >= 300 && response.status < 400) || response.status === 408 || response.status === 429 || response.status >= 500) {
    await response.body?.cancel().catch(() => undefined);
    throw uncertainDelivery("GitHub", response.status);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new NodeFailure("GITHUB_WRITE_REJECTED", `GitHub returned ${response.status}.`, false, response.status);
  }
  const updated = object(await readProviderJson(response, "GitHub", true));
  if (!updated || updated.number !== issueNumber || updated.pull_request !== undefined || updated[field] !== newValue) throw uncertainDelivery("GitHub", response.status);
  return { status: "succeeded" as const, output, route: "success" as const };
}
