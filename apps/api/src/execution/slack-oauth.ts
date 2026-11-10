import { CredentialProvider } from "@prisma/client";
import { nodeConfigIssues } from "@workflow/contracts";
import type { CredentialService } from "../credentials/credential.service";
import { readCredentialId } from "./connector-config";
import { NodeFailure } from "./node-failure";
import { fetchSafeOutbound, fetchSafeOutboundWrite, wasOutboundRedirected } from "./outbound-url-policy";
import { readBoundedProviderJson } from "./provider-json";
import { assertNoCredentialInProviderFields } from "./provider-credential-safety";

const validChannel = (value: unknown): value is string => typeof value === "string" && /^[A-Z][A-Z0-9]{2,63}$/.test(value);
const validCursor = (value: string) => value.length <= 512 && /^[\x21-\x7e]+$/.test(value);
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

async function slackRequest(method: "conversations.list" | "chat.postMessage" | "chat.update", token: string, body?: Record<string, unknown>, cursor?: string, transport = body ? fetchSafeOutboundWrite : fetchSafeOutbound) {
  if (!/^xoxb-[A-Za-z0-9-]{10,512}$/.test(token)) throw new NodeFailure("CREDENTIAL_INVALID", "Reconnect the Slack workspace.", false);
  const url = new URL(`https://slack.com/api/${method}`);
  if (method === "conversations.list") { url.searchParams.set("types", "public_channel"); url.searchParams.set("exclude_archived", "true"); url.searchParams.set("limit", "100"); if (cursor) url.searchParams.set("cursor", cursor); }
  let response: Response;
  try { response = await transport(url.href, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000) }); }
  catch { throw new NodeFailure(body ? "DELIVERY_UNCERTAIN" : "SLACK_UNAVAILABLE", body ? "Slack may have received the message. Check the channel before retrying." : "Slack could not be reached.", !body); }
  if (!response.ok || wasOutboundRedirected(response)) {
    await response.body?.cancel().catch(() => undefined);
    const uncertain = Boolean(body) && (response.status >= 500 || response.status === 408 || wasOutboundRedirected(response));
    throw new NodeFailure(uncertain ? "DELIVERY_UNCERTAIN" : "SLACK_HTTP_ERROR", uncertain ? "Slack may have received the message. Check the channel before retrying." : `Slack returned ${response.status}. Check your connection and permissions.`, !body && (response.status === 429 || response.status >= 500), response.status);
  }
  let data: Record<string, unknown> | null;
  try { data = record(await readBoundedProviderJson(response)); }
  catch { throw new NodeFailure(body ? "DELIVERY_UNCERTAIN" : "INVALID_RESPONSE", body ? "Slack did not confirm the message. Check the channel before retrying." : "Slack returned an invalid response.", false); }
  if (!data || typeof data.ok !== "boolean") throw new NodeFailure(body ? "DELIVERY_UNCERTAIN" : "INVALID_RESPONSE", "Slack returned an invalid response.", false);
  if (!data.ok) {
    const error = typeof data.error === "string" ? data.error : "unknown";
    const message = ["invalid_auth", "token_revoked", "not_authed"].includes(error) ? "Reconnect the Slack workspace." : ["channel_not_found", "not_in_channel"].includes(error) ? "Add the bot to the selected channel and try again." : error === "missing_scope" ? "Reconnect Slack and grant the required permissions." : "Slack rejected the request. Check the connection and channel.";
    throw new NodeFailure("SLACK_REJECTED", message, false);
  }
  return data;
}

export async function listSlackChannels(token: string, cursor?: string, transport = fetchSafeOutbound) {
  if (cursor && !validCursor(cursor)) throw new NodeFailure("INVALID_INPUT", "Invalid Slack page cursor.", false);
  const data = await slackRequest("conversations.list", token, undefined, cursor, transport);
  if (!Array.isArray(data.channels)) throw new NodeFailure("INVALID_RESPONSE", "Slack returned an invalid channel list.", false);
  const channels = data.channels.slice(0, 100).flatMap((value: unknown) => {
    const channel = record(value);
    if (!channel || !validChannel(channel.id) || channel.is_member !== true || typeof channel.name !== "string" || !channel.name.trim()) return [];
    assertNoCredentialInProviderFields([channel.id, channel.name], token);
    return [{ id: channel.id, name: `#${channel.name.slice(0, 100)}` }];
  });
  const metadata = record(data.response_metadata); const nextCursor = typeof metadata?.next_cursor === "string" && metadata.next_cursor ? metadata.next_cursor : null;
  if (nextCursor && (!validCursor(nextCursor) || nextCursor.includes(token))) throw new NodeFailure("INVALID_RESPONSE", "Slack returned an invalid page cursor.", false);
  return { channels, nextCursor };
}

export async function executeSlackOAuth(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport = fetchSafeOutboundWrite, operation: "send" | "update" = "send") {
  const issue = nodeConfigIssues(operation === "update" ? "action.slack.update-message" : "action.slack.message", config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_CONFIGURATION", issue.message, false);
  const channel = String(config.channel ?? ""); const text = String(config.message ?? "");
  if (!validChannel(channel) || !text.trim() || text.length > 4000) throw new NodeFailure("INVALID_CONFIGURATION", "Select a Slack channel and enter a message of at most 4,000 characters.", false);
  if (mode === "mock") return { status: "succeeded" as const, output: { delivered: true, provider: "slack", destination: channel, messageId: operation === "update" ? String(config.messageId) : "1700000000.000001", sentAt: new Date().toISOString(), mode }, route: "success" as const };
  const credential = await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.SLACK_OAUTH);
  const token = typeof credential.accessToken === "string" ? credential.accessToken : "";
  const threadTs = typeof config.threadTs === "string" ? config.threadTs : "";
  const data = await slackRequest(operation === "update" ? "chat.update" : "chat.postMessage", token, { channel, text, ...(operation === "update" ? { ts: config.messageId } : threadTs ? { thread_ts: threadTs } : {}) }, undefined, transport);
  if (!validChannel(data.channel) || data.channel !== channel || typeof data.ts !== "string" || !/^\d{1,20}\.\d{1,20}$/.test(data.ts)) throw new NodeFailure("DELIVERY_UNCERTAIN", "Slack did not confirm the message. Check the channel before retrying.", false);
  if (operation === "update" && data.ts !== config.messageId) throw new NodeFailure("DELIVERY_UNCERTAIN", "Slack did not confirm the selected message. Check the channel before retrying.", false);
  assertNoCredentialInProviderFields([data.channel, data.ts], token);
  return { status: "succeeded" as const, output: { delivered: true, provider: "slack", destination: data.channel, messageId: data.ts, sentAt: new Date().toISOString(), mode }, route: "success" as const };
}
