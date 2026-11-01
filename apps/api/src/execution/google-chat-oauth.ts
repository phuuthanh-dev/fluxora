import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { fetchSafeOutbound } from "./outbound-url-policy";
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
    if (typeof space.name !== "string" || !/^spaces\/[A-Za-z0-9_-]{1,128}$/.test(space.name)) return [];
    return [{ id: space.name, name: typeof space.displayName === "string" && space.displayName.trim() ? space.displayName.slice(0, 160) : space.name }];
  });
  return { spaces, hasMore: typeof data.nextPageToken === "string" && data.nextPageToken.length > 0 };
}

export async function executeGoogleChatOAuth(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutbound) {
  const space = typeof config.space === "string" ? config.space.trim() : "";
  const message = typeof config.message === "string" ? config.message : "";
  if (!/^spaces\/[A-Za-z0-9_-]{1,128}$/.test(space) || !message.trim() || message.length > 10_000) throw new NodeFailure("INVALID_INPUT", "Select a Google Chat space and enter a message of at most 10,000 characters.", false);
  if (mode === "mock") return { status: "succeeded" as const, output: { delivered: true, provider: "google_chat_oauth", destination: space, messageId: "mock-message" }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Google Chat connection.", false);
  const credential = await credentials.readGoogleForExecution(credentialId, workspaceId, CredentialProvider.GOOGLE_CHAT_OAUTH);
  const token = typeof credential.accessToken === "string" ? credential.accessToken : "";
  if (!token || /\s/.test(token)) throw new NodeFailure("CREDENTIAL_INVALID", "Google Chat connection is missing a valid access token.", false);
  let response: Response;
  try { response = await transport(`https://chat.googleapis.com/v1/${space}/messages`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ text: message }), signal: AbortSignal.timeout(15_000) }); }
  catch { throw new NodeFailure("DELIVERY_UNCERTAIN", "Google Chat did not confirm delivery. Check the destination before retrying.", false); }
  if (!response.ok) throw new NodeFailure("GOOGLE_CHAT_ERROR", `Google Chat returned ${response.status}.`, response.status === 429, response.status);
  const payload = await readBoundedProviderJson(response) as { name?: unknown };
  if (!payload || typeof payload.name !== "string" || !/^spaces\/[A-Za-z0-9_-]+\/messages\/[A-Za-z0-9._-]+$/.test(payload.name)) throw new NodeFailure("DELIVERY_UNCERTAIN", "Google Chat did not confirm the message ID. Check the destination before retrying.", false);
  return { status: "succeeded" as const, output: { delivered: true, provider: "google_chat_oauth", destination: space, messageId: payload.name, sentAt: new Date().toISOString() }, route: "success" as const };
}
