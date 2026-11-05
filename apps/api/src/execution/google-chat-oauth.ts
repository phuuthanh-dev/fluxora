import { CredentialProvider } from "@prisma/client";
import { createHash } from "node:crypto";
import type { CredentialService } from "../credentials/credential.service";
import { chatManageScope } from "../credentials/google-oauth-policy";
import { fetchSafeOutbound, fetchSafeOutboundWrite } from "./outbound-url-policy";
import { readBoundedProviderJson } from "./provider-json";
import { NodeFailure } from "./node-failure";

type Transport = typeof fetchSafeOutbound;

export async function listGoogleChatSpaces(token: string, transport: Transport = fetchSafeOutbound) {
  let response: Response;
  try { response = await transport("https://chat.googleapis.com/v1/spaces?pageSize=100", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }); }
  catch { throw new NodeFailure("GOOGLE_CHAT_UNAVAILABLE", "Google Chat spaces could not be loaded.", true); }
  if (!response.ok) throw new NodeFailure("GOOGLE_CHAT_UNAVAILABLE", "Google Chat rejected the request or permissions.", response.status === 429 || response.status >= 500);
  const data = await readBoundedProviderJson(response) as { spaces?: unknown[]; nextPageToken?: unknown };
  if (!data || (data.spaces !== undefined && !Array.isArray(data.spaces))) throw new NodeFailure("INVALID_RESPONSE", "Google Chat returned an invalid space list.", false);
  const spaces = (data.spaces ?? []).slice(0, 100).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const space = entry as Record<string, unknown>;
    if (typeof space.name !== "string" || !/^spaces\/[A-Za-z0-9_-]{1,128}$/.test(space.name) || (!!token && space.name.includes(token))) return [];
    const displayName = typeof space.displayName === "string" ? (token ? space.displayName.split(token).join("[REDACTED]") : space.displayName).trim() : "";
    const fallback = space.spaceType === "DIRECT_MESSAGE" ? "Direct message"
      : space.spaceType === "GROUP_CHAT" ? "Group conversation"
      : space.spaceType === "SPACE" ? "Unnamed space" : "Unnamed conversation";
    return [{ id: space.name, name: displayName ? displayName.slice(0, 160) : `${fallback} · ${space.name}` }];
  });
  return { spaces, hasMore: typeof data.nextPageToken === "string" && data.nextPageToken.length > 0 };
}

export async function executeGoogleChatOAuth(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutboundWrite, variant: "send" | "reply" = "send") {
  const space = typeof config.space === "string" ? config.space.trim() : "";
  const message = typeof config.message === "string" ? config.message : "";
  if (!/^spaces\/[A-Za-z0-9_-]{1,128}$/.test(space) || !message.trim() || message.length > 10_000) throw new NodeFailure("INVALID_INPUT", "Select a Google Chat space and enter a message of at most 10,000 characters.", false);
  const threadName = variant === "reply" && typeof config.threadName === "string" ? config.threadName.trim() : "";
  if (variant === "reply" && (!/^spaces\/[A-Za-z0-9_-]{1,128}\/threads\/[A-Za-z0-9._-]{1,256}$/.test(threadName) || !threadName.startsWith(`${space}/threads/`))) throw new NodeFailure("INVALID_INPUT", "Enter a thread belonging to the selected Google Chat space.", false);
  if (mode === "mock") return { status: "succeeded" as const, output: { delivered: true, provider: "google_chat_oauth", destination: space, messageId: `${space}/messages/mock-message`, sentAt: new Date().toISOString(), simulated: true, threadName: variant === "reply" ? threadName : `${space}/threads/mock-thread` }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Google Chat connection.", false);
  const credential = await credentials.readGoogleForExecution(credentialId, workspaceId, CredentialProvider.GOOGLE_CHAT_OAUTH);
  const token = typeof credential.accessToken === "string" ? credential.accessToken : "";
  if (!token || /\s/.test(token)) throw new NodeFailure("CREDENTIAL_INVALID", "Google Chat connection is missing a valid access token.", false);
  let response: Response;
  const replyQuery = variant === "reply" ? "?messageReplyOption=REPLY_MESSAGE_OR_FAIL" : "";
  try { response = await transport(`https://chat.googleapis.com/v1/${space}/messages${replyQuery}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ text: message, ...(variant === "reply" ? { thread: { name: threadName } } : {}) }), signal: AbortSignal.timeout(15_000) }); }
  catch { throw new NodeFailure("DELIVERY_UNCERTAIN", "Google Chat did not confirm delivery. Check the destination before retrying.", false); }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    if (response.redirected || (response.status >= 300 && response.status < 400) || response.status === 408 || response.status >= 500) throw new NodeFailure("DELIVERY_UNCERTAIN", "Google Chat did not confirm delivery. Check the destination before retrying.", false, response.status);
    throw new NodeFailure("GOOGLE_CHAT_ERROR", `Google Chat returned ${response.status}.`, response.status === 429 && !response.redirected, response.status);
  }
  let payload: { name?: unknown; thread?: unknown } | null;
  try { payload = await readBoundedProviderJson(response) as typeof payload; }
  catch { throw new NodeFailure("DELIVERY_UNCERTAIN", "Google Chat did not confirm the message receipt. Check the destination before retrying.", false); }
  if (!payload || typeof payload.name !== "string" || !/^spaces\/[A-Za-z0-9_-]{1,128}\/messages\/[A-Za-z0-9._-]{1,256}$/.test(payload.name) || !payload.name.startsWith(`${space}/messages/`) || payload.name.includes(token)) throw new NodeFailure("DELIVERY_UNCERTAIN", "Google Chat did not confirm the message ID. Check the destination before retrying.", false);
  const rawThread = payload.thread && typeof payload.thread === "object" && !Array.isArray(payload.thread) ? (payload.thread as Record<string, unknown>).name : undefined;
  if (payload.thread !== undefined && (!payload.thread || typeof payload.thread !== "object" || Array.isArray(payload.thread))) throw new NodeFailure("DELIVERY_UNCERTAIN", "Google Chat did not confirm the thread. Check the destination before retrying.", false);
  if (rawThread !== undefined && (typeof rawThread !== "string" || !/^spaces\/[A-Za-z0-9_-]{1,128}\/threads\/[A-Za-z0-9._-]{1,256}$/.test(rawThread) || !rawThread.startsWith(`${space}/threads/`) || rawThread.includes(token))) throw new NodeFailure("DELIVERY_UNCERTAIN", "Google Chat did not confirm the thread. Check the destination before retrying.", false);
  if (variant === "reply" && rawThread !== threadName) throw new NodeFailure("DELIVERY_UNCERTAIN", "Google Chat did not confirm the thread. Check the destination before retrying.", false);
  return { status: "succeeded" as const, output: { delivered: true, provider: "google_chat_oauth", destination: space, messageId: payload.name, sentAt: new Date().toISOString(), threadName: typeof rawThread === "string" ? rawThread : null }, route: "success" as const };
}

/** Editing requires an explicitly selected, provider-verified management grant. */
export async function executeGoogleChatEdit(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutboundWrite) {
  const space = typeof config.space === "string" ? config.space.trim() : "";
  const messageName = typeof config.messageName === "string" ? config.messageName.trim() : "";
  const message = typeof config.message === "string" ? config.message : "";
  if (!/^spaces\/[A-Za-z0-9_-]{1,128}$/.test(space) || !/^spaces\/[A-Za-z0-9_-]{1,128}\/messages\/[A-Za-z0-9._-]{1,256}$/.test(messageName) || !messageName.startsWith(`${space}/messages/`) || !message.trim() || message.length > 10_000) throw new NodeFailure("INVALID_INPUT", "Select a space, enter a message from that space and provide new text.", false);
  if (mode === "mock") return { status: "succeeded" as const, output: { updated: true, messageId: messageName, simulated: true }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Google Chat connection.", false);
  const credential = await credentials.readGoogleForExecution(credentialId, workspaceId, CredentialProvider.GOOGLE_CHAT_OAUTH);
  const token = typeof credential.accessToken === "string" ? credential.accessToken : "";
  if (!token || /\s/.test(token)) throw new NodeFailure("CREDENTIAL_INVALID", "Google Chat connection is missing a valid access token.", false);
  if (!Array.isArray(credential.grantedScopes) || !credential.grantedScopes.includes(chatManageScope) || credential.scopeTokenHash !== createHash("sha256").update(token).digest("hex")) throw new NodeFailure("GOOGLE_CHAT_SCOPE_MISSING", "Reconnect Google Chat and explicitly enable message management.", false);
  let response: Response;
  try { response = await transport(`https://chat.googleapis.com/v1/${messageName}?updateMask=text`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ text: message }), signal: AbortSignal.timeout(15_000) }); }
  catch { throw new NodeFailure("DELIVERY_UNCERTAIN", "Google Chat did not confirm the update. Check the message before retrying.", false); }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    if (response.redirected || (response.status >= 300 && response.status < 400) || response.status === 408 || response.status >= 500) throw new NodeFailure("DELIVERY_UNCERTAIN", "Google Chat did not confirm the update. Check the message before retrying.", false, response.status);
    throw new NodeFailure("GOOGLE_CHAT_ERROR", `Google Chat returned ${response.status}.`, false, response.status);
  }
  let payload: { name?: unknown } | null;
  try { payload = await readBoundedProviderJson(response) as typeof payload; }
  catch { throw new NodeFailure("DELIVERY_UNCERTAIN", "Google Chat did not confirm the update. Check the message before retrying.", false); }
  if (!payload || payload.name !== messageName || messageName.includes(token)) throw new NodeFailure("DELIVERY_UNCERTAIN", "Google Chat did not confirm the update. Check the message before retrying.", false);
  return { status: "succeeded" as const, output: { updated: true, messageId: messageName }, route: "success" as const };
}
