import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { readBoundedProviderJson } from "./provider-json";
import { markPageTokenOutput } from "./redaction";
import { assertNoCredentialInProviderFields } from "./provider-credential-safety";

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

function plainText(payload: unknown, token: string) {
  let found = "";
  const visit = (item: unknown, depth: number) => {
    if (depth > 10 || found) return;
    const part = record(item);
    if (!part) return;
    const body = record(part.body);
    if (part.mimeType === "text/plain" && !part.filename && typeof body?.data === "string" && body.data.length <= 100_000 && /^[A-Za-z0-9_-]*={0,2}$/.test(body.data)) {
      const decoded = Buffer.from(body.data, "base64url").toString("utf8");
      assertNoCredentialInProviderFields([decoded], token);
      found = decoded.slice(0, 50_000);
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
    assertNoCredentialInProviderFields([entry?.value], token);
    return typeof entry?.value === "string" ? entry.value.slice(0, 1000) : "";
  };
  if (data.labelIds !== undefined && (!Array.isArray(data.labelIds) || data.labelIds.some((label) => typeof label !== "string" || label.length > 128))) throw new NodeFailure("INVALID_RESPONSE", "Gmail returned invalid labels.", false);
  const threadId = typeof data.threadId === "string" && messageIdPattern.test(data.threadId) ? data.threadId : "";
  const labels = (data.labelIds as string[] | undefined) ?? [];
  assertNoCredentialInProviderFields([id, threadId, data.snippet, ...labels], token);
  return { id, threadId, from: header("from"), to: header("to"), subject: header("subject"), date: header("date"), snippet: typeof data.snippet === "string" ? data.snippet.slice(0, 2000) : "", text: plainText(payload, token), labels };
}

type GmailListOutput = { messages: Array<Omit<Awaited<ReturnType<typeof getGmailMessage>>, "labels">>; count: number; hasMore: boolean; nextPageToken?: string | null };
export async function listGmailMessages(token: string, query: string, limit: number, transport: Transport = fetchSafeOutbound, pageToken?: string, requireBoundedPage = false): Promise<GmailListOutput> {
  if (!token || token.length > 4096 || /\s/.test(token) || query.length > 500 || !Number.isInteger(limit) || limit < 1 || limit > 10 || (pageToken !== undefined && !/^[\x21-\x7e]{1,1024}$/.test(pageToken))) throw new NodeFailure("INVALID_INPUT", "Enter a valid Gmail query, page token and limit between 1 and 10.", false);
  const params = new URLSearchParams({ maxResults: String(limit), q: query });
  if (pageToken) params.set("pageToken", pageToken);
  const list = await getGmailJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`, token, transport);
  if (list.messages !== undefined && !Array.isArray(list.messages)) throw new NodeFailure("INVALID_RESPONSE", "Gmail returned an invalid message list.", false);
  if (requireBoundedPage && Array.isArray(list.messages) && list.messages.length > limit) throw new NodeFailure("INVALID_RESPONSE", "Gmail returned more messages than requested.", false);
  const refs = (Array.isArray(list.messages) ? list.messages : []).slice(0, limit);
  const messages = [];
  for (const entry of refs) {
    const id = record(entry)?.id;
    if (typeof id !== "string" || !messageIdPattern.test(id)) throw new NodeFailure("INVALID_RESPONSE", "Gmail returned an invalid message ID.", false);
    const { labels: _labels, ...message } = await getGmailMessage(token, id, transport);
    messages.push(message);
  }
  if (list.nextPageToken !== undefined && (typeof list.nextPageToken !== "string" || !/^[\x21-\x7e]{1,1024}$/.test(list.nextPageToken))) throw new NodeFailure("INVALID_RESPONSE", "Gmail returned an invalid continuation token.", false);
  const nextPageToken = typeof list.nextPageToken === "string" ? list.nextPageToken : null;
  if (nextPageToken?.includes(token)) throw new NodeFailure("INVALID_RESPONSE", "Gmail returned an invalid continuation token.", false);
  return markPageTokenOutput({ messages, count: messages.length, hasMore: nextPageToken !== null, nextPageToken });
}

export async function executeGmailRead(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, read: typeof listGmailMessages = listGmailMessages): Promise<{ status: "succeeded"; output: GmailListOutput; route: "success" }> {
  if (((Object.hasOwn(config, "query") && typeof config.query !== "string") || (Object.hasOwn(config, "limit") && config.limit === undefined) || (Object.hasOwn(config, "mailbox") && config.mailbox === undefined))) {
    throw new NodeFailure("INVALID_INPUT", "Gmail filters or pagination could not be resolved.", false);
  }
  const query = typeof config.query === "string" ? config.query : "";
  const limit = config.limit === undefined ? 5 : config.limit;
  const mailbox = config.mailbox === undefined ? "inbox" : config.mailbox;
  const collectPages = config.collectPages === true;
  if (Object.hasOwn(config, "collectPages") && typeof config.collectPages !== "boolean") throw new NodeFailure("INVALID_INPUT", "Choose whether to collect additional Gmail results.", false);
  if (Object.hasOwn(config, "pageToken") && config.pageToken === undefined) throw new NodeFailure("INVALID_INPUT", "Gmail page token could not be resolved.", false);
  const pageToken = config.pageToken === undefined || config.pageToken === "" ? undefined : config.pageToken;
  if (query.length > 470 || !["all", "inbox", "unread"].includes(String(mailbox)) || typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 10 || (pageToken !== undefined && (typeof pageToken !== "string" || !/^[\x21-\x7e]{1,1024}$/.test(pageToken)))) throw new NodeFailure("INVALID_INPUT", "Enter a valid Gmail filter, page token and limit between 1 and 10.", false);
  if (mode === "mock") {
    const output = { messages: [{ id: "mock-message", threadId: "mock-thread", from: "sender@example.test", to: "owner@example.test", subject: "Example message", date: "", snippet: "Example", text: "Example message" }], count: 1, hasMore: false };
    return { status: "succeeded", output: markPageTokenOutput({ ...output, nextPageToken: null }), route: "success" };
  }
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Gmail connection.", false);
  const credential = await credentials.readGoogleForExecution(credentialId, workspaceId, CredentialProvider.GMAIL);
  const token = typeof credential.accessToken === "string" ? credential.accessToken : "";
  const search = [mailbox === "inbox" ? "in:inbox" : mailbox === "unread" ? "in:inbox is:unread" : "", query.trim()].filter(Boolean).join(" ");
  if (collectPages) {
    const messages: GmailListOutput["messages"] = [];
    let next = pageToken as string | undefined;
    const seen = new Set<string>(next === undefined ? [] : [next]);
    for (let request = 0; request < 5; request++) {
      const result = await read(token, search, limit - messages.length, undefined, next, true);
      messages.push(...result.messages);
      if (!result.hasMore) return { status: "succeeded", output: markPageTokenOutput({ messages, count: messages.length, hasMore: false, nextPageToken: null }), route: "success" };
      if (!result.nextPageToken || seen.has(result.nextPageToken)) throw new NodeFailure("INVALID_RESPONSE", "Gmail returned a repeated or missing continuation token.", false);
      next = result.nextPageToken;
      seen.add(next);
      if (messages.length >= limit || request === 4) return { status: "succeeded", output: markPageTokenOutput({ messages, count: messages.length, hasMore: true, nextPageToken: next }), route: "success" };
    }
    throw new NodeFailure("INVALID_RESPONSE", "Gmail pagination did not complete.", false);
  }
  const result = await read(token, search, limit, undefined, pageToken as string | undefined);
  const output = result;
  return { status: "succeeded", output, route: "success" };
}
