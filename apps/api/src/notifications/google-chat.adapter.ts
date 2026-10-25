import { fetchSafeOutbound } from "../execution/outbound-url-policy";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "../execution/node-failure";
import type { NotificationAdapter, NotificationPayload, NormalizedDeliveryResult } from "./notification-contracts";

export function maskGoogleChatWebhookUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.search = "";
    return url.toString();
  } catch {
    return "https://chat.googleapis.com/v1/spaces/unknown/messages";
  }
}

export class GoogleChatNotificationAdapter implements NotificationAdapter {
  readonly provider = "google_chat" as const;

  async send(
    payload: NotificationPayload,
    credentialData?: Record<string, unknown>,
    mode: "mock" | "live" = "live",
  ): Promise<NormalizedDeliveryResult> {
    const message = typeof payload.message === "string" && payload.message.trim()
      ? payload.message
      : (typeof payload.content === "string" ? payload.content : "");

    if (mode === "mock") {
      return {
        delivered: true,
        provider: this.provider,
        destination: "https://chat.googleapis.com/v1/spaces/mock-space/messages",
        messageId: "mock-google-chat-msg-id",
        sentAt: new Date().toISOString(),
        mode: "mock",
      };
    }

    if (!message.trim()) {
      throw new NodeFailure("INVALID_CONFIGURATION", "Google Chat message is required.", false);
    }

    const webhookUrl = credentialData?.webhookUrl;
    if (typeof webhookUrl !== "string" || !webhookUrl.trim()) {
      throw new NodeFailure("CREDENTIAL_INVALID", "Credential is missing webhookUrl.", false);
    }

    const destination = maskGoogleChatWebhookUrl(webhookUrl);

    let response: Response;
    try {
      response = await fetchSafeOutbound(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (reason) {
      throw nodeFailureFromOutboundPolicy(reason);
    }

    if (!response.ok) {
      throw new NodeFailure(
        "HTTP_ERROR",
        `Google Chat returned ${response.status}.`,
        response.status === 429 || response.status >= 500,
        response.status,
      );
    }

    let messageId: string | undefined;
    try {
      const text = await response.text();
      if (text) {
        const json = JSON.parse(text) as { name?: string };
        if (json && typeof json.name === "string") {
          messageId = json.name;
        }
      }
    } catch {
      // not JSON or body already read
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
