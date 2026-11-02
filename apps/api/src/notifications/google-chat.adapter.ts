import { fetchSafeOutbound, wasOutboundRedirected } from "../execution/outbound-url-policy";
import { NodeFailure } from "../execution/node-failure";
import { readBoundedProviderJson } from "../execution/provider-json";
import { notificationReceiptFailure, notificationWriteFailure } from "./notification-write-failure";
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
      throw notificationWriteFailure(reason);
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new NodeFailure(
        "HTTP_ERROR",
        `Google Chat returned ${response.status}.`,
        response.status === 429 && !wasOutboundRedirected(response),
        response.status,
      );
    }

    let receipt: { name?: unknown } | null;
    try {
      receipt = await readBoundedProviderJson(response) as typeof receipt;
    } catch {
      throw notificationReceiptFailure("Google Chat");
    }
    if (!receipt || typeof receipt.name !== "string" || !/^spaces\/[A-Za-z0-9_-]+\/messages\/[A-Za-z0-9._-]+$/.test(receipt.name)) {
      throw notificationReceiptFailure("Google Chat");
    }

    return {
      delivered: true,
      provider: this.provider,
      destination,
      messageId: receipt.name,
      sentAt: new Date().toISOString(),
      mode: "live",
    };
  }
}
