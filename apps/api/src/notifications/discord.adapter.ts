import { fetchSafeOutbound } from "../execution/outbound-url-policy";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "../execution/node-failure";
import type { DiscordAllowedMentions, NotificationAdapter, NotificationPayload, NormalizedDeliveryResult } from "./notification-contracts";

export function validateDiscordWebhookUrl(rawUrl: string): { webhookId: string; webhookToken: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new NodeFailure("INVALID_CONFIGURATION", "Discord webhook URL is invalid.", false);
  }
  if (parsed.protocol !== "https:") {
    throw new NodeFailure("INVALID_CONFIGURATION", "Discord webhook URL must use HTTPS.", false);
  }
  if (parsed.username || parsed.password) {
    throw new NodeFailure("INVALID_CONFIGURATION", "Discord webhook URL must not include credentials in the authority.", false);
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "discord.com" && hostname !== "discordapp.com") {
    throw new NodeFailure("INVALID_CONFIGURATION", "Discord webhook URL must be hosted on discord.com or discordapp.com.", false);
  }
  const match = /^\/api\/webhooks\/([^/]+)\/([^/]+)$/.exec(parsed.pathname);
  if (!match || !match[1]?.trim() || !match[2]?.trim()) {
    throw new NodeFailure("INVALID_CONFIGURATION", "Discord webhook URL must have the path /api/webhooks/{webhookId}/{webhookToken}.", false);
  }
  return { webhookId: match[1].trim(), webhookToken: match[2].trim() };
}

export function maskDiscordWebhookUrl(webhookUrl: string): string {
  try {
    const { webhookId } = validateDiscordWebhookUrl(webhookUrl);
    return `https://discord.com/api/webhooks/${webhookId}/[REDACTED]`;
  } catch {
    return "https://discord.com/api/webhooks/unknown/[REDACTED]";
  }
}

export function parseDiscordEmbeds(embedsInput: unknown): unknown[] | undefined {
  if (embedsInput === undefined || embedsInput === null || embedsInput === "") {
    return undefined;
  }
  if (Array.isArray(embedsInput)) {
    return embedsInput;
  }
  if (typeof embedsInput === "string") {
    const trimmed = embedsInput.trim();
    if (!trimmed) return undefined;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      throw new Error();
    } catch {
      throw new NodeFailure("INVALID_CONFIGURATION", "Discord embeds must be a JSON array.", false);
    }
  }
  throw new NodeFailure("INVALID_CONFIGURATION", "Discord embeds must be a JSON array.", false);
}

export class DiscordNotificationAdapter implements NotificationAdapter {
  readonly provider = "discord" as const;

  async send(
    payload: NotificationPayload,
    credentialData?: Record<string, unknown>,
    mode: "mock" | "live" = "live",
  ): Promise<NormalizedDeliveryResult> {
    const content = typeof payload.content === "string" ? payload.content : (typeof payload.message === "string" ? payload.message : "");
    const username = typeof payload.username === "string" && payload.username.trim() ? payload.username.trim() : undefined;
    const avatarUrl = typeof payload.avatarUrl === "string" && payload.avatarUrl.trim() ? payload.avatarUrl.trim() : undefined;
    const embeds = parseDiscordEmbeds(payload.embeds);
    const allowedMentions: DiscordAllowedMentions = payload.allowedMentions ?? { parse: [] };

    if (mode === "mock") {
      return {
        delivered: true,
        provider: this.provider,
        destination: "https://discord.com/api/webhooks/mock-id/[REDACTED]",
        messageId: "mock-discord-msg-id",
        sentAt: new Date().toISOString(),
        mode: "mock",
      };
    }

    if (!content.trim() && (!embeds || embeds.length === 0)) {
      throw new NodeFailure("INVALID_CONFIGURATION", "Discord message content is required.", false);
    }

    const webhookUrl = credentialData?.webhookUrl;
    if (typeof webhookUrl !== "string" || !webhookUrl.trim()) {
      throw new NodeFailure("CREDENTIAL_INVALID", "Credential is missing webhookUrl.", false);
    }

    const { webhookId } = validateDiscordWebhookUrl(webhookUrl);
    const destination = `https://discord.com/api/webhooks/${webhookId}/[REDACTED]`;

    const requestPayload: Record<string, unknown> = {
      content,
      allowed_mentions: allowedMentions,
    };
    if (username) requestPayload.username = username;
    if (avatarUrl) requestPayload.avatar_url = avatarUrl;
    if (embeds && embeds.length > 0) requestPayload.embeds = embeds;

    let response: Response;
    try {
      response = await fetchSafeOutbound(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (reason) {
      throw nodeFailureFromOutboundPolicy(reason);
    }

    if (!response.ok) {
      throw new NodeFailure(
        "HTTP_ERROR",
        `Discord returned ${response.status}.`,
        response.status === 429 || response.status >= 500,
        response.status,
      );
    }

    let messageId: string | undefined;
    try {
      const text = await response.text();
      if (text) {
        const json = JSON.parse(text) as { id?: string | number };
        if (json && json.id !== undefined) {
          messageId = String(json.id);
        }
      }
    } catch {
      // not JSON or 204 no content
    }

    return {
      delivered: true,
      provider: this.provider,
      destination,
      messageId,
      sentAt: new Date().toISOString(),
      mode: "live",
    };
  }
}
