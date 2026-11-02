import { CredentialProvider } from "@prisma/client";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type GoogleConnectionKind = "google" | "chat" | "gmail" | "calendar";
export const chatManageScope = "https://www.googleapis.com/auth/chat.messages";
const chatSendScope = "https://www.googleapis.com/auth/chat.messages.create";
const chatSpacesScope = "https://www.googleapis.com/auth/chat.spaces.readonly";
export const gmailCapabilityScopes = {
  readonly: "https://www.googleapis.com/auth/gmail.readonly",
  send: "https://www.googleapis.com/auth/gmail.send",
  compose: "https://www.googleapis.com/auth/gmail.compose",
  modify: "https://www.googleapis.com/auth/gmail.modify",
  labels: "https://www.googleapis.com/auth/gmail.labels",
} as const;
export type GmailCapability = keyof typeof gmailCapabilityScopes;
export function validGmailCapabilities(value: unknown): value is GmailCapability[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 5 && value.includes("readonly") && value.every((item) => typeof item === "string" && Object.hasOwn(gmailCapabilityScopes, item)) && new Set(value).size === value.length;
}
export function gmailScopesForCapabilities(capabilities: GmailCapability[]) {
  return capabilities.map((capability) => gmailCapabilityScopes[capability]);
}

// A broader Google scope can satisfy a selected narrower capability. Projection
// later returns only those capabilities selected by the owner.
const fullGmailScope = "https://mail.google.com/";
const gmailCapabilityAlternatives: Record<GmailCapability, readonly string[]> = {
  readonly: [gmailCapabilityScopes.readonly, gmailCapabilityScopes.modify, fullGmailScope],
  send: [gmailCapabilityScopes.send, gmailCapabilityScopes.compose, gmailCapabilityScopes.modify, fullGmailScope],
  compose: [gmailCapabilityScopes.compose, gmailCapabilityScopes.modify, fullGmailScope],
  modify: [gmailCapabilityScopes.modify, fullGmailScope],
  labels: [gmailCapabilityScopes.labels, gmailCapabilityScopes.modify, fullGmailScope],
};
export function gmailCapabilitiesGranted(granted: unknown, capabilities: readonly GmailCapability[]) {
  return googleScopesGranted(granted, []) && capabilities.every((capability) => gmailCapabilityAlternatives[capability].some((scope) => (granted as string[]).includes(scope)));
}
export function projectGmailScopes(granted: unknown, selected: readonly GmailCapability[]) {
  if (!googleScopesGranted(granted, [])) return [];
  return selected.filter((capability) => gmailCapabilitiesGranted(granted, [capability])).map((capability) => gmailCapabilityScopes[capability]);
}
export function googleConnectionScopesGranted(kind: GoogleConnectionKind, granted: unknown, gmailCapabilities: readonly GmailCapability[] = ["readonly"]) {
  return kind === "gmail" ? gmailCapabilitiesGranted(granted, gmailCapabilities) : kind === "chat" ? googleChatScopesGranted(granted) : googleScopesGranted(granted, googleConnectionPolicy[kind].scopes);
}

export function googleChatScopesGranted(granted: unknown) {
  return googleScopesGranted(granted, [chatSpacesScope]) && (granted as string[]).some((scope) => scope === chatSendScope || scope === chatManageScope);
}


export const googleConnectionPolicy = {
  google: { provider: CredentialProvider.GOOGLE, label: "Google OAuth", scopes: ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/spreadsheets"] },
  chat: { provider: CredentialProvider.GOOGLE_CHAT_OAUTH, label: "Google Chat OAuth", scopes: ["https://www.googleapis.com/auth/chat.messages.create", "https://www.googleapis.com/auth/chat.spaces.readonly"] },
  gmail: { provider: CredentialProvider.GMAIL, label: "Gmail OAuth", scopes: ["https://www.googleapis.com/auth/gmail.readonly"] },
  calendar: { provider: CredentialProvider.GOOGLE_CALENDAR, label: "Google Calendar OAuth", scopes: ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.calendarlist.readonly", "https://www.googleapis.com/auth/calendar.events.freebusy"] },
} satisfies Record<GoogleConnectionKind, { provider: CredentialProvider; label: string; scopes: string[] }>;

export function googleScopesGranted(granted: unknown, required: readonly string[]) {
  return Array.isArray(granted) && granted.length <= 100 && granted.every((scope) => typeof scope === "string" && scope.length > 0 && scope.length <= 256) && required.every((scope) => granted.includes(scope));
}

export function googleScopeTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Authenticated evidence prevents manual JSON credentials from inventing grants.
// This never leaves the encrypted credential or enters a browser response.
export function googleScopeProof(token: string, scopes: string[]) {
  const key = Buffer.from(process.env.APP_ENCRYPTION_KEY ?? "", "base64");
  if (key.length !== 32) throw new Error("Google scope proof key unavailable");
  const body = JSON.stringify(["google-oauth-scope-v1", googleScopeTokenHash(token), [...new Set(scopes)].sort()]);
  return createHmac("sha256", key).update(body).digest("hex");
}

export function googleScopeProofValid(data: Record<string, unknown>) {
  if (typeof data.accessToken !== "string" || typeof data.scopeTokenHash !== "string" || data.scopeTokenHash !== googleScopeTokenHash(data.accessToken) || typeof data.scopeProof !== "string" || !/^[0-9a-f]{64}$/.test(data.scopeProof) || !googleScopesGranted(data.grantedScopes, [])) return false;
  const supplied = Buffer.from(data.scopeProof, "hex");
  const expected = Buffer.from(googleScopeProof(data.accessToken, data.grantedScopes as string[]), "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function metadataProof(domain: string, token: string, values: string[]) {
  const key = Buffer.from(process.env.APP_ENCRYPTION_KEY ?? "", "base64");
  if (key.length !== 32) throw new Error("Google scope proof key unavailable");
  return createHmac("sha256", key).update(JSON.stringify([domain, googleScopeTokenHash(token), [...new Set(values)].sort()])).digest("hex");
}
function validMetadataProof(proof: unknown, expected: string) {
  if (typeof proof !== "string" || !/^[0-9a-f]{64}$/.test(proof)) return false;
  return timingSafeEqual(Buffer.from(proof, "hex"), Buffer.from(expected, "hex"));
}
export function googleRefreshGrantProof(refreshToken: string, scopes: string[]) {
  return metadataProof("google-refresh-grant-v1", refreshToken, scopes);
}
export function googleRefreshGrantValid(data: Record<string, unknown>) {
  if (typeof data.refreshToken !== "string" || !data.refreshToken || !googleScopesGranted(data.refreshGrantScopes, []) || typeof data.refreshGrantProof !== "string" || !/^[0-9a-f]{64}$/.test(data.refreshGrantProof)) return false;
  return validMetadataProof(data.refreshGrantProof, googleRefreshGrantProof(data.refreshToken, data.refreshGrantScopes as string[]));
}
export function gmailCapabilityProof(refreshToken: string, capabilities: GmailCapability[]) {
  return metadataProof("gmail-selected-capabilities-v1", refreshToken, capabilities);
}
export function gmailCapabilitiesValid(data: Record<string, unknown>) {
  if (typeof data.refreshToken !== "string" || !data.refreshToken || !validGmailCapabilities(data.gmailCapabilities) || typeof data.gmailCapabilityProof !== "string" || !/^[0-9a-f]{64}$/.test(data.gmailCapabilityProof)) return false;
  return validMetadataProof(data.gmailCapabilityProof, gmailCapabilityProof(data.refreshToken, data.gmailCapabilities));
}

/** Bind explicit Chat management consent to the stored refresh grant. */
export function chatManageProof(refreshToken: string) {
  return metadataProof("google-chat-manage-v1", refreshToken, [chatManageScope]);
}
export function chatManageValid(data: Record<string, unknown>) {
  if (data.chatManage !== true || typeof data.refreshToken !== "string" || !data.refreshToken || typeof data.chatManageProof !== "string" || !/^[0-9a-f]{64}$/.test(data.chatManageProof)) return false;
  return validMetadataProof(data.chatManageProof, chatManageProof(data.refreshToken));
}

export function sameGoogleScopes(left: unknown, right: unknown) {
  if (!googleScopesGranted(left, []) || !googleScopesGranted(right, [])) return false;
  const a = new Set(left as string[]); const b = new Set(right as string[]);
  return a.size === b.size && [...a].every((scope) => b.has(scope));
}

// The bearer token is sent only to Google's fixed HTTPS endpoint, never in a URL.
async function googleUserInfo(accessToken: string) {
  try {
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error();
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    const account = value as Record<string, unknown>;
    if (typeof account.sub !== "string" || !/^[A-Za-z0-9_-]{1,255}$/.test(account.sub)) throw new Error();
    return account as Record<string, unknown> & { sub: string };
  } catch { return undefined; }
}

export async function googleSubject(accessToken: string) {
  return (await googleUserInfo(accessToken))?.sub;
}

export async function googleAccount(accessToken: string) {
  const account = await googleUserInfo(accessToken);
  if (!account || typeof account.email !== "string" || account.email.length > 254 || !/^[^\s@\x00-\x1f\x7f]+@[^\s@\x00-\x1f\x7f]+$/.test(account.email) || account.email_verified !== true) return undefined;
  return { sub: account.sub, email: account.email };
}
