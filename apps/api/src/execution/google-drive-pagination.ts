import { NodeFailure } from "./node-failure";
import { markDriveListOutput } from "./redaction";

const drivePageSize = 100;

/** Opaque tokens are bounded and URI-encodable, without assuming a Google token alphabet. */
function validPageToken(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 1024 || /[\u0000-\u001f\u007f-\u009f]/.test(value)) return false;
  try { encodeURIComponent(value); return true; } catch { return false; }
}

export function readDrivePageToken(config: Record<string, unknown>): string | undefined {
  if (!Object.hasOwn(config, "pageToken") || config.pageToken === "") return undefined;
  if (!validPageToken(config.pageToken)) throw new NodeFailure("INVALID_INPUT", "Enter a valid Google Drive page token of at most 1,024 characters.", false);
  return config.pageToken;
}

export function driveListUrl(operation: string, config: Record<string, unknown>, pageToken?: string) {
  const query = new URLSearchParams({ fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)", pageSize: String(drivePageSize) });
  if (operation === "search" && typeof config.query === "string" && config.query) query.set("q", config.query);
  if (pageToken !== undefined) query.set("pageToken", pageToken);
  return `https://www.googleapis.com/drive/v3/files?${query}`;
}

export function driveListOutput(operation: string, value: unknown, accessToken?: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Google Drive returned an invalid file list.", false);
  const body = value as Record<string, unknown>;
  if (!Array.isArray(body.files) || body.files.length > drivePageSize || (body.nextPageToken !== undefined && (!validPageToken(body.nextPageToken) || (!!accessToken && body.nextPageToken.includes(accessToken))))) {
    throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Google Drive returned an invalid file list or continuation token.", false);
  }
  return markDriveListOutput({ operation, files: body.files, nextPageToken: body.nextPageToken === undefined ? null : body.nextPageToken as string });
}
