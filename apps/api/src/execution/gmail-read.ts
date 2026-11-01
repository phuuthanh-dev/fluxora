import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { readBoundedProviderJson } from "./provider-json";

type Transport = typeof fetchSafeOutbound;
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const messageIdPattern = /^[A-Za-z0-9_-]{1,128}$/;

export async function getGmailJson(url: string, token: string, transport: Transport): Promise<Record<string, unknown>> {
  let target: URL;
  try { target = new URL(url); } catch { throw new NodeFailure("INVALID_INPUT", "Gmail request target is invalid.", false); }
  if (target.protocol !== "https:" || target.hostname !== "gmail.googleapis.com" || target.port || target.username || target.password || !target.pathname.startsWith("/gmail/v1/users/me/")) throw new NodeFailure("INVALID_INPUT", "Gmail request target is invalid.", false);
  let response: Response;
  try { response = await transport(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }); }
  catch { throw new NodeFailure("GMAIL_UNAVAILABLE", "Gmail could not be reached.", true); }
  if (!response.ok) throw new NodeFailure("GMAIL_ERROR", `Gmail returned ${response.status}. Check the connection and permissions.`, response.status === 429 || response.status >= 500, response.status);
  let payload: unknown;
  try { payload = await readBoundedProviderJson(response); }
  catch (error) { if (error instanceof NodeFailure) throw error; throw new NodeFailure("INVALID_RESPONSE", "Gmail returned an invalid response.", false); }
  const result = record(payload);
  if (!result) throw new NodeFailure("INVALID_RESPONSE", "Gmail returned an invalid response.", false);
  return result;
}

function plainText(payload: unknown) {
  let found = "";
  const visit = (item: unknown, depth: number) => {
    if (depth > 10 || found) return;
    const part = record(item);
    if (!part) return;
    const body = record(part.body);
    if (part.mimeType === "text/plain" && !part.filename && typeof body?.data === "string" && body.data.length <= 100_000 && /^[A-Za-z0-9_-]*={0,2}$/.test(body.data)) {
      found = Buffer.from(body.data, "base64url").toString("utf8").slice(0, 50_000);
      return;
    }
    if (Array.isArray(part.parts)) for (const child of part.parts.slice(0, 50)) visit(child, depth + 1);
  };
  visit(payload, 0);
  return found;
}

export async function getGmailMessage(token: string, id: string, transport: Transport = fetchSafeOutbound) {
  if (!token || token.length > 4096 || /\s/.test(token) || !messageIdPattern.test(id)) throw new NodeFailure("INVALID_INPUT", "Gmail message reference is invalid.", false);
  const data = await getGmailJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`, token, transport);
  const payload = record(data.payload);
  const headers = Array.isArray(payload?.headers) ? payload.headers : [];
  const header = (name: string) => {
    const entry = headers.map(record).find((item) => typeof item?.name === "string" && item.name.toLowerCase() === name);
    return typeof entry?.value === "string" ? entry.value.slice(0, 1000) : "";
  };
  if (data.labelIds !== undefined && (!Array.isArray(data.labelIds) || data.labelIds.some((label) => typeof label !== "string" || label.length > 128))) throw new NodeFailure("INVALID_RESPONSE", "Gmail returned invalid labels.", false);
  return { id, threadId: typeof data.threadId === "string" && messageIdPattern.test(data.threadId) ? data.threadId : "", from: header("from"), to: header("to"), subject: header("subject"), date: header("date"), snippet: typeof data.snippet === "string" ? data.snippet.slice(0, 2000) : "", text: plainText(payload), labels: (data.labelIds as string[] | undefined) ?? [] };
}

export async function listGmailMessages(token: string, query: string, limit: number, transport: Transport = fetchSafeOutbound) {
  if (!token || token.length > 4096 || /\s/.test(token) || query.length > 500 || !Number.isInteger(limit) || limit < 1 || limit > 10) throw new NodeFailure("INVALID_INPUT", "Enter a valid Gmail query and limit between 1 and 10.", false);
  const params = new URLSearchParams({ maxResults: String(limit), q: query });
  const list = await getGmailJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`, token, transport);
  if (list.messages !== undefined && !Array.isArray(list.messages)) throw new NodeFailure("INVALID_RESPONSE", "Gmail returned an invalid message list.", false);
  const refs = (Array.isArray(list.messages) ? list.messages : []).slice(0, limit);
  const messages = [];
  for (const entry of refs) {
    const id = record(entry)?.id;
    if (typeof id !== "string" || !messageIdPattern.test(id)) throw new NodeFailure("INVALID_RESPONSE", "Gmail returned an invalid message ID.", false);
    const { labels: _labels, ...message } = await getGmailMessage(token, id, transport);
    messages.push(message);
  }
  return { messages, count: messages.length, hasMore: typeof list.nextPageToken === "string" && !!list.nextPageToken };
}

export async function executeGmailRead(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, read: typeof listGmailMessages = listGmailMessages) {
  const query = typeof config.query === "string" ? config.query : "";
  const limit = config.limit === undefined ? 5 : config.limit;
  const mailbox = config.mailbox === undefined ? "inbox" : config.mailbox;
  if (query.length > 470 || !["all", "inbox", "unread"].includes(String(mailbox)) || typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 10) throw new NodeFailure("INVALID_INPUT", "Enter a valid Gmail filter and limit between 1 and 10.", false);
  if (mode === "mock") return { status: "succeeded" as const, output: { messages: [{ id: "mock-message", threadId: "mock-thread", from: "sender@example.test", to: "owner@example.test", subject: "Example message", date: "", snippet: "Example", text: "Example message" }], count: 1, hasMore: false }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Gmail connection.", false);
  const credential = await credentials.readGoogleForExecution(credentialId, workspaceId, CredentialProvider.GMAIL);
  const token = typeof credential.accessToken === "string" ? credential.accessToken : "";
  const search = [mailbox === "inbox" ? "in:inbox" : mailbox === "unread" ? "in:inbox is:unread" : "", query.trim()].filter(Boolean).join(" ");
  return { status: "succeeded" as const, output: await read(token, search, limit), route: "success" as const };
}
