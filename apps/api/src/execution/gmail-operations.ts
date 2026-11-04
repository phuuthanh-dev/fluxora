import { CredentialProvider } from "@prisma/client";
import { createHash } from "node:crypto";
import { Agent } from "undici";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure } from "./node-failure";
import { createSafeSocketLookup } from "./outbound-url-policy";
import { readBoundedProviderJson } from "./provider-json";

// Standalone backend primitives: the caller must authorize the workspace and
// disable runner write recovery/replay until the coordinator implements it.
// New credentials need trusted provider-verified grantedScopes and a SHA-256
// scopeTokenHash bound to the current access token. A refresh invalidates that
// binding until trusted auth code verifies and records the new token's scopes.
// Credentials with neither field get legacy full-message read compatibility
// only; they cannot be distinguished from new credentials lacking metadata.
type Transport = (url: string, init: RequestInit) => Promise<Response>;
const dispatcher = new Agent({ connect: { lookup: createSafeSocketLookup() } });
const defaultTransport: Transport = (url, init) => fetch(url, { ...init, dispatcher } as unknown as RequestInit);
const base = "https://gmail.googleapis.com/gmail/v1/users/me/";
const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
const messageIdPattern = /^<[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9.-]+>$/;
type ScopeNeed = "fullRead" | "metadata" | "modify" | "send" | "compose" | "labels";
const scope = (name: string) => `https://www.googleapis.com/auth/gmail.${name}`;
const mailScope = "https://mail.google.com/";
const scopeOptions: Record<ScopeNeed, string[]> = {
  fullRead: [scope("readonly"), scope("modify"), mailScope],
  metadata: [scope("metadata"), scope("readonly"), scope("modify"), mailScope],
  modify: [scope("modify"), mailScope],
  send: [scope("send"), scope("compose"), scope("modify"), mailScope],
  compose: [scope("compose"), scope("modify"), mailScope],
  labels: [scope("labels"), scope("modify"), mailScope],
};
const asRecord = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const invalid = () => new NodeFailure("INVALID_INPUT", "Invalid Gmail operation input.", false);
const badResponse = () => new NodeFailure("INVALID_RESPONSE", "Gmail returned an invalid response.", false);
const uncertain = () => new NodeFailure("GMAIL_WRITE_UNCERTAIN", "Gmail did not confirm the operation. Check Gmail before retrying.", false);

function id(value: unknown): string {
  if (typeof value !== "string" || !idPattern.test(value)) throw invalid();
  return value;
}
function providerId(value: unknown): string {
  if (typeof value !== "string" || !idPattern.test(value)) throw badResponse();
  return value;
}
function clean(value: unknown, max: number, token: string): string {
  return typeof value === "string" ? value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").split(token).join("[redacted]").slice(0, max) : "";
}
function inputHeader(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw invalid();
  return value;
}
function addresses(value: unknown, required: boolean): string[] {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || value.length > 50 || (required && !value.length)) throw invalid();
  return value.map((entry: unknown) => {
    const address = inputHeader(entry, 254);
    if (!/^[A-Za-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(address) || address.includes("..")) throw invalid();
    return address;
  });
}
function labelIds(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) throw invalid();
  const result = value.map(id);
  if (new Set(result).size !== result.length) throw invalid();
  return result;
}
function providerLabels(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 1000) throw badResponse();
  return value.map(providerId);
}

export type GmailConnection = { workspaceId: string; credentialId: string; credentials: Pick<CredentialService, "readGoogleForExecution">; transport?: Transport };
export type GmailMessageInput = { to: string[]; cc?: string[]; bcc?: string[]; subject: string; text: string };
export type GmailLabelChanges = { addLabelIds?: string[]; removeLabelIds?: string[] };
export type GmailLabelPatch = { name?: string; labelListVisibility?: "labelShow" | "labelShowIfUnread" | "labelHide"; messageListVisibility?: "show" | "hide" };
export const GMAIL_OPERATIONS_SAFETY = { draftSendById: "disabled", runnerWriteRecovery: "disabled_pending_coordinator" } as const;

/** The returned client never exposes a token and always uses the selected workspace's Gmail credential. */
export function gmailOperations(connection: GmailConnection) {
  if (!connection.workspaceId || !connection.credentialId) throw invalid();
  const transport = connection.transport ?? defaultTransport;
  async function tokenForRequest(needs: ScopeNeed[]) {
    let credential: Awaited<ReturnType<CredentialService["readGoogleForExecution"]>>;
    try { credential = await connection.credentials.readGoogleForExecution(connection.credentialId, connection.workspaceId, CredentialProvider.GMAIL); }
    catch { throw new NodeFailure("CREDENTIAL_UNAVAILABLE", "Gmail connection is unavailable in this workspace.", false); }
    const token = credential.accessToken;
    if (typeof token !== "string" || !token || token.length > 4096 || !/^[A-Za-z0-9._~+\/-]+=*$/.test(token)) throw new NodeFailure("CREDENTIAL_INVALID", "Gmail connection is invalid.", false);
    const granted = credential.grantedScopes;
    const fingerprint = credential.scopeTokenHash;
    const legacyRead = granted === undefined && fingerprint === undefined && needs.length === 1 && needs[0] === "fullRead";
    if (!legacyRead) {
      if (!Array.isArray(granted) || granted.length > 100 || granted.some((item) => typeof item !== "string" || item.length > 256) || typeof fingerprint !== "string" || fingerprint !== createHash("sha256").update(token).digest("hex")) {
        throw new NodeFailure("GMAIL_SCOPE_UNVERIFIED", "Gmail permissions are not verified for this access token. Reconnect with the required permissions.", false);
      }
      if (needs.some((need) => !scopeOptions[need].some((accepted) => granted.includes(accepted)))) throw new NodeFailure("GMAIL_SCOPE_MISSING", "The Gmail connection lacks permissions required for this operation.", false);
    }
    return token;
  }
  function privateResult<T>(value: T, token: string, write: boolean): T {
    if (JSON.stringify(value).includes(token)) throw write ? uncertain() : badResponse();
    return value;
  }
  async function request(path: string, method: "GET" | "POST" | "PUT" | "PATCH", needs: ScopeNeed[], body?: unknown, resolvedToken?: string) {
    const token = resolvedToken ?? await tokenForRequest(needs);
    const write = method !== "GET";
    let response: Response;
    try {
      response = await transport(base + path, { method, redirect: "manual", headers: { Authorization: `Bearer ${token}`, ...(write ? { "Content-Type": "application/json" } : {}) }, ...(write ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000) });
    } catch { throw write ? uncertain() : new NodeFailure("GMAIL_UNAVAILABLE", "Gmail could not be reached.", true); }
    if (response.redirected || (response.status >= 300 && response.status < 400)) {
      await response.body?.cancel().catch(() => undefined);
      throw write ? uncertain() : new NodeFailure("GMAIL_REDIRECT", "Gmail redirected the request.", false);
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      // All write failures are terminal: even 5xx or a rejected response may
      // follow a committed side effect. Never include provider response text.
      if (write && (response.status === 408 || response.status >= 500)) throw uncertain();
      throw new NodeFailure("GMAIL_ERROR", `Gmail returned ${response.status}. Check the connection and permissions.`, !write && (response.status === 429 || response.status >= 500), response.status);
    }
    let data: Record<string, unknown> | null;
    try { data = asRecord(await readBoundedProviderJson(response)); }
    catch { throw write ? uncertain() : badResponse(); }
    if (!data) throw write ? uncertain() : badResponse();
    return { data, token };
  }
  function receipt(data: Record<string, unknown>, expectedThread?: string) {
    try {
      const messageId = providerId(data.id);
      const threadId = providerId(data.threadId);
      if (expectedThread && threadId !== expectedThread) throw badResponse();
      return { messageId, threadId, status: "accepted" as const, acceptance: "gmail_api_receipt" as const, inboxDelivery: "unconfirmed" as const, deliveryConfirmed: false as const };
    } catch { throw uncertain(); }
  }
  function draftReceipt(data: Record<string, unknown>, expectedId?: string, expectedThread?: string) {
    try {
      const draftId = providerId(data.id);
      if (expectedId && draftId !== expectedId) throw badResponse();
      const message = asRecord(data.message);
      if (!message) throw badResponse();
      const messageId = providerId(message.id);
      const threadId = providerId(message.threadId);
      if (expectedThread && threadId !== expectedThread) throw badResponse();
      return { draftId, messageId, threadId };
    } catch { throw uncertain(); }
  }
  async function readMessage(messageId: string) {
    const target = id(messageId);
    const { data, token } = await request(`messages/${target}?format=full`, "GET", ["fullRead"]);
    if (providerId(data.id) !== target) throw badResponse();
    const threadId = providerId(data.threadId);
    const payload = asRecord(data.payload);
    const headers = Array.isArray(payload?.headers) ? payload.headers.slice(0, 200) : [];
    const header = (name: string) => clean(headers.map(asRecord).find((h) => typeof h?.name === "string" && h.name.toLowerCase() === name)?.value, 1000, token).replace(/[\r\n]+/g, " ");
    let text: string | undefined;
    let bodyCharset: "utf-8" | "us-ascii" | "unspecified" | null = null;
    let truncated = false; let partial = false; let attachmentsPresent = false;
    let attachmentBacked = false; let unsupportedCharset = false; let invalidEncoding = false; let htmlPresent = false;
    let visited = 0;
    const visit = (item: unknown, depth: number) => {
      if (depth > 10 || visited++ >= 200) { partial = true; return; }
      const part = asRecord(item); if (!part) return;
      const body = asRecord(part.body);
      const attachment = (typeof part.filename === "string" && part.filename.length > 0) || typeof body?.attachmentId === "string";
      if (attachment) attachmentsPresent = true;
      if (part.mimeType === "text/html" && !part.filename) htmlPresent = true;
      if (part.mimeType === "text/plain" && !part.filename) {
        if (typeof body?.attachmentId === "string" && typeof body.data !== "string") attachmentBacked = true;
        if (typeof body?.data === "string") {
          if (text !== undefined) partial = true;
          else {
            const partHeaders = Array.isArray(part.headers) ? part.headers.slice(0, 200).map(asRecord) : [];
            if (Array.isArray(part.headers) && part.headers.length > 200) partial = true;
            const contentType = partHeaders.find((h) => typeof h?.name === "string" && h.name.toLowerCase() === "content-type")?.value;
            const match = typeof contentType === "string" ? /(?:^|;)\s*charset\s*=\s*(?:"([^"\r\n]+)"|([^;\s]+))/i.exec(contentType) : null;
            const charset = (match?.[1] ?? match?.[2] ?? "").toLowerCase();
            if (typeof contentType === "string" && /(?:^|;)\s*charset\s*=/i.test(contentType) && !match) unsupportedCharset = true;
            else if (charset && charset !== "utf-8" && charset !== "us-ascii") unsupportedCharset = true;
            else if (!/^[A-Za-z0-9_-]*={0,2}$/.test(body.data) || body.data.replace(/=+$/, "").length % 4 === 1) invalidEncoding = true;
            else {
              try {
                const bytes = Buffer.from(body.data, "base64url");
                if (typeof body.size === "number" && Number.isSafeInteger(body.size) && body.size > bytes.length) partial = true;
                if (charset === "us-ascii" && bytes.some((byte) => byte > 127)) throw new Error("Invalid ASCII");
                const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
                // The whole bounded decoded value must be redacted before any
                // truncation, including when a token crosses the output limit.
                const sanitized = clean(decoded, decoded.length + 1_000_000, token);
                truncated = sanitized.length > 50_000;
                text = sanitized.slice(0, 50_000);
                bodyCharset = charset === "utf-8" ? "utf-8" : charset === "us-ascii" ? "us-ascii" : "unspecified";
              } catch { invalidEncoding = true; }
            }
          }
        }
      }
      if (Array.isArray(part.parts)) {
        if (part.parts.length > 50) partial = true;
        for (const child of part.parts.slice(0, 50)) visit(child, depth + 1);
      }
    };
    visit(payload, 0);
    partial ||= unsupportedCharset || invalidEncoding || attachmentBacked;
    const bodyStatus = text !== undefined ? truncated ? "truncated" : partial ? "partial" : "available" : attachmentBacked ? "attachment_backed" : unsupportedCharset ? "unsupported_charset" : invalidEncoding ? "invalid_encoding" : partial ? "partial" : htmlPresent ? "html_only" : "missing";
    return privateResult({ id: target, threadId, from: header("from"), to: header("to"), subject: header("subject"), date: header("date"), snippet: clean(data.snippet, 2000, token), text: text ?? "", bodyStatus, bodyCharset, bodyPartial: partial, attachmentsPresent, attachmentBacked, labels: providerLabels(data.labelIds) }, token, false);
  }
  async function modify(kind: "messages" | "threads", targetId: string, changes: GmailLabelChanges) {
    const target = id(targetId); const addLabelIds = labelIds(changes?.addLabelIds); const removeLabelIds = labelIds(changes?.removeLabelIds);
    if ((!addLabelIds.length && !removeLabelIds.length) || addLabelIds.some((label) => removeLabelIds.includes(label))) throw invalid();
    const { data, token } = await request(`${kind}/${target}/modify`, "POST", ["modify"], { addLabelIds, removeLabelIds });
    try {
      if (providerId(data.id) !== target) throw badResponse();
      return privateResult(kind === "messages" ? { id: target, labels: providerLabels(data.labelIds) } : { id: target }, token, true);
    } catch { throw uncertain(); }
  }
  async function replyContext(messageId: string, token: string) {
    const target = id(messageId);
    const { data } = await request(`messages/${target}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=In-Reply-To&metadataHeaders=Subject`, "GET", ["metadata"], undefined, token);
    if (providerId(data.id) !== target) throw badResponse();
    const threadId = providerId(data.threadId);
    const payload = asRecord(data.payload);
    if (!Array.isArray(payload?.headers) || payload.headers.length > 200) throw badResponse();
    const header = (name: string) => {
      const matches = (payload.headers as unknown[]).map(asRecord).filter((h) => typeof h?.name === "string" && h.name.toLowerCase() === name);
      if (matches.length > 1 || (matches.length && typeof matches[0]?.value !== "string")) throw badResponse();
      const raw = matches.length ? matches[0]!.value as string : "";
      if (raw.length > 4096) throw badResponse();
      // Only CRLF followed by whitespace is valid header folding. Other
      // control characters and bare line breaks are rejected below.
      const unfolded = raw.replace(/\r\n[ \t]+/g, " ");
      if (/[\x00-\x08\x0a-\x1f\x7f]/.test(unfolded)) throw badResponse();
      return unfolded.replace(/[ \t]+/g, " ").trim();
    };
    const parent = header("message-id"); const subject = header("subject"); const references = header("references"); const inReplyTo = header("in-reply-to");
    if ([threadId, parent, subject, references, inReplyTo].some((value) => value.includes(token))) throw badResponse();
    // References wins; RFC 5322 permits one parent In-Reply-To as fallback.
    // Refuse malformed, multiple, or ambiguous IDs rather than guess a chain.
    if (!messageIdPattern.test(parent) || parent.length > 250 || subject.length > 800 || references.length > 2000 || (references && !references.split(" ").every((v) => v.length <= 250 && messageIdPattern.test(v))) || (inReplyTo && (inReplyTo.length > 250 || !messageIdPattern.test(inReplyTo)))) throw badResponse();
    const refs = references ? references.split(" ") : inReplyTo ? [inReplyTo] : [];
    if (!refs.includes(parent)) refs.push(parent);
    return { threadId, subject, parent, references: refs };
  }
  function mime(input: GmailMessageInput, reply?: Awaited<ReturnType<typeof replyContext>>) {
    const to = addresses(input?.to, true); const cc = addresses(input?.cc, false); const bcc = addresses(input?.bcc, false);
    if (to.length + cc.length + bcc.length > 50) throw invalid();
    const subject = reply ? reply.subject : inputHeader(input?.subject, 800);
    if (typeof input?.text !== "string" || Buffer.byteLength(input.text, "utf8") > 100_000 || /\x00/.test(input.text)) throw invalid();
    // Encode non-ASCII subject in short RFC 2047 words, without splitting UTF-8.
    const words: string[] = []; let chunk = "";
    for (const char of subject) { if (Buffer.byteLength(chunk + char, "utf8") > 30) { words.push(chunk); chunk = ""; } chunk += char; }
    if (chunk) words.push(chunk);
    const encodedSubject = /[^\x20-\x7e]/.test(subject) ? words.map((word) => `=?UTF-8?B?${Buffer.from(word).toString("base64")}?=`).join("\r\n ") : subject;
    const body = Buffer.from(input.text.replace(/\r\n|\r|\n/g, "\r\n"), "utf8").toString("base64").match(/.{1,76}/g)?.join("\r\n") ?? "";
    const lines = [`To: ${to.join(",\r\n ")}`, ...(cc.length ? [`Cc: ${cc.join(",\r\n ")}`] : []), ...(bcc.length ? [`Bcc: ${bcc.join(",\r\n ")}`] : []), `Subject: ${encodedSubject}`, ...(reply ? [`In-Reply-To: ${reply.parent}`, `References: ${reply.references.join("\r\n ")}`] : []), "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", body];
    return { raw: Buffer.from(lines.join("\r\n"), "utf8").toString("base64url"), ...(reply ? { threadId: reply.threadId } : {}) };
  }
  async function compose(input: GmailMessageInput, action: "send" | "draft" | "updateDraft", draftId?: string, parentId?: string) {
    // Validate all caller-controlled MIME fields before any provider request.
    mime(input);
    const draft = action === "updateDraft" ? id(draftId) : undefined;
    if (parentId !== undefined) id(parentId);
    const needs: ScopeNeed[] = [action === "send" ? "send" : "compose"];
    if (parentId !== undefined) needs.push("metadata");
    const token = await tokenForRequest(needs);
    const reply = parentId === undefined ? undefined : await replyContext(parentId, token!);
    const message = mime(input, reply);
    const path = action === "send" ? "messages/send" : draft ? `drafts/${draft}` : "drafts";
    const response = await request(path, draft ? "PUT" : "POST", needs, action === "send" ? message : { message }, token);
    return privateResult(action === "send" ? receipt(response.data, reply?.threadId) : draftReceipt(response.data, draft, reply?.threadId), response.token, true);
  }
  return {
    getMessage: readMessage,
    modifyMessage: (messageId: string, changes: GmailLabelChanges) => modify("messages", messageId, changes),
    modifyThread: (threadId: string, changes: GmailLabelChanges) => modify("threads", threadId, changes),
    createDraft: (input: GmailMessageInput, replyToMessageId?: string) => compose(input, "draft", undefined, replyToMessageId),
    updateDraft: (draftId: string, input: GmailMessageInput, replyToMessageId?: string) => compose(input, "updateDraft", draftId, replyToMessageId),
    sendMessage: (input: GmailMessageInput) => compose(input, "send"),
    reply: (messageId: string, input: GmailMessageInput) => compose(input, "send", undefined, messageId),
    // Disabled until the coordinator supplies safe draft identity/recovery semantics.
    sendDraft: async (_draftId: string): Promise<never> => { throw new NodeFailure("GMAIL_OPERATION_DISABLED", "Sending an existing draft is not available yet.", false); },
    updateLabel: async (labelId: string, patch: GmailLabelPatch) => {
      const target = id(labelId);
      if (!patch || typeof patch !== "object" || Object.keys(patch).some((key) => !["name", "labelListVisibility", "messageListVisibility"].includes(key)) || !Object.keys(patch).length) throw invalid();
      if (patch.name !== undefined && (!inputHeader(patch.name, 225).trim())) throw invalid();
      if (patch.labelListVisibility !== undefined && !["labelShow", "labelShowIfUnread", "labelHide"].includes(patch.labelListVisibility)) throw invalid();
      if (patch.messageListVisibility !== undefined && !["show", "hide"].includes(patch.messageListVisibility)) throw invalid();
      const { data, token } = await request(`labels/${target}`, "PATCH", ["labels"], patch);
      try { if (providerId(data.id) !== target || typeof data.name !== "string" || data.name.length > 225) throw badResponse(); return privateResult({ id: target, name: clean(data.name, 225, token) }, token, true); } catch { throw uncertain(); }
    },
  };
}
