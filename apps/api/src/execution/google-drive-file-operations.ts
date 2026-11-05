import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure } from "./node-failure";
import { fetchSafeOutbound, fetchSafeOutboundWrite, wasOutboundRedirected } from "./outbound-url-policy";
import { assertNoCredentialInProviderFields } from "./provider-credential-safety";
import { readProviderJson, uncertainDelivery } from "./provider-request-policy";
import { maximumRetryDelayMs, parseRetryAfter } from "./retry-policy";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
const driveId = /^[A-Za-z0-9_-]{1,200}$/;
const folderMime = "application/vnd.google-apps.folder";

function inputId(value: unknown, optional = false): string {
  if (optional && (value === undefined || value === "")) return "";
  if (typeof value !== "string" || !driveId.test(value)) throw new NodeFailure("INVALID_INPUT", "Choose a valid Google Drive file or folder ID.", false);
  return value;
}

async function accessToken(config: Record<string, unknown>, workspaceId: string, credentials: CredentialService) {
  const credentialId = typeof config.credentialId === "string" ? config.credentialId.trim() : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Google connection.", false);
  const credential = await credentials.readGoogleForExecution(credentialId, workspaceId);
  const token = credential.accessToken;
  if (typeof token !== "string" || !token || token.length > 4096 || /\s/.test(token)) throw new NodeFailure("CREDENTIAL_INVALID", "Google connection is invalid.", false);
  return token;
}

function providerFile(value: unknown, token: string): { id: string; name: string; mimeType: string } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const file = value as Record<string, unknown>;
  if (typeof file.id !== "string" || !driveId.test(file.id) || typeof file.name !== "string" || file.name.length > 1024 || typeof file.mimeType !== "string" || file.mimeType.length > 256) return undefined;
  assertNoCredentialInProviderFields([file.id, file.name, file.mimeType], token);
  return { id: file.id, name: file.name, mimeType: file.mimeType };
}

/** Read limited metadata only. The selected file must be accessible to this connection. */
export async function executeDriveGetFile(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, read: Transport = fetchSafeOutbound) {
  const fileId = inputId(config.fileId);
  if (mode === "mock") return { status: "succeeded" as const, output: { file: { id: fileId, name: "Example file", mimeType: "text/plain" } }, route: "success" as const };
  const token = await accessToken(config, workspaceId, credentials);
  assertNoCredentialInProviderFields([fileId], token);
  let response: Response;
  try { response = await read(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id%2Cname%2CmimeType`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }); }
  catch { throw new NodeFailure("GOOGLE_DRIVE_UNAVAILABLE", "Google Drive could not be reached.", true); }
  if (!response.ok) {
    const retryAfterMs = response.status === 429 ? parseRetryAfter(response.headers.get("retry-after")) : undefined;
    await response.body?.cancel().catch(() => undefined);
    throw new NodeFailure("GOOGLE_DRIVE_ERROR", `Google Drive returned ${response.status}.`, (response.status === 429 && (retryAfterMs === undefined || retryAfterMs <= maximumRetryDelayMs)) || response.status >= 500, response.status, retryAfterMs);
  }
  const file = providerFile(await readProviderJson(response, "Google Drive"), token);
  if (!file || file.id !== fileId) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Google Drive returned invalid file metadata.", false);
  return { status: "succeeded" as const, output: { file }, route: "success" as const };
}

/** Creating a folder is not idempotent: uncertain outcomes must be checked before retrying. */
export async function executeDriveCreateFolder(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, write: Transport = fetchSafeOutboundWrite) {
  const parentId = inputId(config.parentId, true);
  const name = typeof config.name === "string" ? config.name.trim() : "";
  if (!name || name.length > 255 || /[\u0000-\u001f\u007f]/.test(name)) throw new NodeFailure("INVALID_INPUT", "Enter a folder name of at most 255 characters.", false);
  if (mode === "mock") return { status: "succeeded" as const, output: { folder: { id: "mock-folder", name, mimeType: folderMime } }, route: "success" as const };
  const token = await accessToken(config, workspaceId, credentials);
  assertNoCredentialInProviderFields([name, parentId], token);
  let response: Response;
  try {
    response = await write("https://www.googleapis.com/drive/v3/files?fields=id%2Cname%2CmimeType", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: folderMime, ...(parentId ? { parents: [parentId] } : {}) }), signal: AbortSignal.timeout(15_000) });
  } catch { throw uncertainDelivery("Google Drive"); }
  if (wasOutboundRedirected(response) || (response.status >= 300 && response.status < 400) || response.status === 408 || response.status === 429 || response.status >= 500) {
    await response.body?.cancel().catch(() => undefined);
    throw uncertainDelivery("Google Drive", response.status);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new NodeFailure("GOOGLE_DRIVE_WRITE_REJECTED", `Google Drive returned ${response.status}.`, false, response.status);
  }
  let folder: ReturnType<typeof providerFile>;
  try { folder = providerFile(await readProviderJson(response, "Google Drive", true), token); }
  catch { throw uncertainDelivery("Google Drive", response.status); }
  if (!folder || folder.mimeType !== folderMime) throw uncertainDelivery("Google Drive", response.status);
  return { status: "succeeded" as const, output: { folder }, route: "success" as const };
}
