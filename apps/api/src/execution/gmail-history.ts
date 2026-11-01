import { getGmailJson } from "./gmail-read";
import { NodeFailure } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { createHmac } from "node:crypto";

type Transport = typeof fetchSafeOutbound;
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const historyIdPattern = /^[0-9]{1,32}$/;
const messageIdPattern = /^[A-Za-z0-9_-]{1,128}$/;

function validToken(token: string) {
  return token.length > 0 && token.length <= 4096 && !/\s/.test(token);
}

/** Capture a baseline before activation; no mailbox content is returned. */
export async function getGmailHistoryBaseline(token: string, transport: Transport = fetchSafeOutbound) {
  if (!validToken(token)) throw new NodeFailure("INVALID_INPUT", "Gmail connection is invalid.", false);
  const profile = await getGmailJson("https://gmail.googleapis.com/gmail/v1/users/me/profile", token, transport);
  if (typeof profile.historyId !== "string" || !historyIdPattern.test(profile.historyId) || typeof profile.emailAddress !== "string" || !/^[^\s@]+@[^\s@]+$/.test(profile.emailAddress) || profile.emailAddress.length > 320) throw new NodeFailure("INVALID_RESPONSE", "Gmail returned an invalid mailbox profile.", false);
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key || Buffer.from(key, "base64").length !== 32) throw new NodeFailure("ENCRYPTION_KEY_REQUIRED", "Application encryption is not configured.", false);
  const mailboxHash = createHmac("sha256", Buffer.from(key, "base64")).update(profile.emailAddress.toLowerCase()).digest("hex");
  return { historyId: profile.historyId, mailboxHash };
}

/** One page only: callers must process and persist it before advancing the checkpoint. */
export async function getGmailHistoryPage(token: string, startHistoryId: string, pageToken?: string, transport: Transport = fetchSafeOutbound) {
  if (!validToken(token) || !historyIdPattern.test(startHistoryId) || (pageToken !== undefined && (pageToken.length > 512 || !/^[\x21-\x7e]+$/.test(pageToken)))) throw new NodeFailure("INVALID_INPUT", "Gmail history checkpoint is invalid.", false);
  const params = new URLSearchParams({ startHistoryId, historyTypes: "messageAdded", maxResults: "100" });
  if (pageToken) params.set("pageToken", pageToken);
  let payload: Record<string, unknown>;
  try { payload = await getGmailJson(`https://gmail.googleapis.com/gmail/v1/users/me/history?${params}`, token, transport); }
  catch (error) {
    if (error instanceof NodeFailure && error.statusCode === 404) throw new NodeFailure("GMAIL_HISTORY_EXPIRED", "Gmail history expired. Review the possible gap before reactivating this trigger.", false, 404);
    throw error;
  }
  if (typeof payload.historyId !== "string" || !historyIdPattern.test(payload.historyId) || (payload.history !== undefined && !Array.isArray(payload.history)) || (payload.nextPageToken !== undefined && (typeof payload.nextPageToken !== "string" || payload.nextPageToken.length > 512 || !/^[\x21-\x7e]+$/.test(payload.nextPageToken)))) throw new NodeFailure("INVALID_RESPONSE", "Gmail returned an invalid history page.", false);
  const ids = new Set<string>();
  for (const item of Array.isArray(payload.history) ? payload.history : []) {
    const changes = record(item)?.messagesAdded;
    if (changes === undefined) continue;
    if (!Array.isArray(changes)) throw new NodeFailure("INVALID_RESPONSE", "Gmail returned an invalid history page.", false);
    for (const change of changes) {
      const id = record(record(change)?.message)?.id;
      if (typeof id !== "string" || !messageIdPattern.test(id)) throw new NodeFailure("INVALID_RESPONSE", "Gmail returned an invalid message ID.", false);
      ids.add(id);
    }
  }
  return { messageIds: [...ids], historyId: payload.historyId, nextPageToken: typeof payload.nextPageToken === "string" ? payload.nextPageToken : null };
}
