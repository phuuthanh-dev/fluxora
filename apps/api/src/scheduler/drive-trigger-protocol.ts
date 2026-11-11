import { fetchSafeOutbound } from "../execution/outbound-url-policy";
import { readBoundedProviderJson } from "../execution/provider-json";
import { assertNoCredentialInProviderValue } from "../execution/provider-credential-safety";
import { NodeFailure } from "../execution/node-failure";

const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const validCursor = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 2048 && /^[\x21-\x7e]+$/.test(value);
type Transport = typeof fetchSafeOutbound;

async function driveGet(path: string, token: string, transport: Transport): Promise<Record<string, unknown>> {
  if (!token || /\s/.test(token) || token.length > 4096) throw new NodeFailure("CREDENTIAL_REQUIRED", "Reconnect the Google connection.", false);
  let response: Response;
  try { response = await transport(`https://www.googleapis.com/drive/v3/${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }); }
  catch { throw new NodeFailure("DRIVE_UNAVAILABLE", "Google Drive could not be reached.", true); }
  if (!response.ok) throw new NodeFailure(response.status === 410 ? "DRIVE_CHECKPOINT_EXPIRED" : "DRIVE_ERROR", `Google Drive returned ${response.status}. Check the connection and permissions.`, response.status === 429 || response.status >= 500, response.status);
  const data = record(await readBoundedProviderJson(response));
  if (!data) throw new NodeFailure("INVALID_RESPONSE", "Google Drive returned an invalid response.", false);
  assertNoCredentialInProviderValue(data, token);
  return data;
}

export async function driveStartCursor(token: string, transport: Transport = fetchSafeOutbound): Promise<string> {
  const data = await driveGet("changes/startPageToken", token, transport);
  if (!validCursor(data.startPageToken)) throw new NodeFailure("INVALID_RESPONSE", "Google Drive returned an invalid checkpoint.", false);
  return data.startPageToken;
}

/** One page is committed atomically before its successor is fetched. Drive changes describe the latest file state. */
export async function driveChanges(token: string, cursor: string, transport: Transport = fetchSafeOutbound) {
  if (!validCursor(cursor)) throw new NodeFailure("DRIVE_CHECKPOINT_INVALID", "The Drive checkpoint is invalid.", false);
  const query = new URLSearchParams({ pageToken: cursor, pageSize: "100", fields: "nextPageToken,newStartPageToken,changes(fileId,removed,time,file(id,name,mimeType,parents,createdTime,modifiedTime,version,trashed))" });
  const data = await driveGet(`changes?${query}`, token, transport);
  if (!Array.isArray(data.changes)) throw new NodeFailure("INVALID_RESPONSE", "Google Drive returned an invalid changes list.", false);
  const next = data.nextPageToken ?? data.newStartPageToken;
  if (!validCursor(next) || (data.nextPageToken && next === cursor)) throw new NodeFailure("INVALID_RESPONSE", "Google Drive returned an invalid checkpoint.", false);
  return { cursor: next, hasMore: Boolean(data.nextPageToken), changes: data.changes.map((item) => record(item)).filter((item): item is Record<string, unknown> => Boolean(item)) };
}
