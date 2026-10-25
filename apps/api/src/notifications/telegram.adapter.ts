import { fetchSafeOutbound } from "../execution/outbound-url-policy";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "../execution/node-failure";
import type { NotificationAdapter, NotificationPayload, NormalizedDeliveryResult } from "./notification-contracts";

export function sanitizeTelegramFailure(reason: unknown, token?: string): NodeFailure {
  const failure = nodeFailureFromOutboundPolicy(reason);
  const rawMessage = reason instanceof Error && reason.message ? reason.message : failure.message;
  let message = rawMessage;
  if (token) {
    message = message.replaceAll(token, "[REDACTED]");
  }
  message = message.replace(/(\/bot)[^/\s]+/gi, "$1[REDACTED]");
  return new NodeFailure(failure.code, message, failure.retryable, failure.statusCode);
}

export class TelegramNotificationAdapter implements NotificationAdapter {
  readonly provider = "telegram" as const;

  async send(
    payload: NotificationPayload,
    credentialData?: Record<string, unknown>,
    mode: "mock" | "live" = "live",
  ): Promise<NormalizedDeliveryResult> {
    const text = typeof payload.text === "string"
      ? payload.text
      : (typeof payload.content === "string" ? payload.content : (typeof payload.message === "string" ? payload.message : ""));
    const parseMode = typeof payload.parseMode === "string" && payload.parseMode.trim() ? payload.parseMode.trim() : undefined;

    const payloadChatId = payload.destination !== undefined && payload.destination !== ""
      ? String(payload.destination).trim()
      : (payload.chatId !== undefined && payload.chatId !== "" ? String(payload.chatId).trim() : undefined);

    const credentialChatId = credentialData?.chatId !== undefined && credentialData.chatId !== ""
      ? String(credentialData.chatId).trim()
      : undefined;

    const chatId = payloadChatId ?? credentialChatId;

    if (mode === "mock") {
      return {
        delivered: true,
        provider: this.provider,
        destination: chatId ?? "mock-chat-id",
        messageId: "mock-telegram-msg-id",
        sentAt: new Date().toISOString(),
        mode: "mock",
      };
    }

    if (!text.trim()) {
      throw new NodeFailure("INVALID_CONFIGURATION", "Telegram message text is required.", false);
    }

    if (!chatId) {
      throw new NodeFailure("INVALID_CONFIGURATION", "Telegram chat ID is required in node configuration.", false);
    }

    const botToken = credentialData?.botToken;
    if (typeof botToken !== "string" || !botToken.trim()) {
      throw new NodeFailure("CREDENTIAL_INVALID", "Credential is missing botToken.", false);
    }

    const requestPayload: Record<string, unknown> = {
      chat_id: chatId,
      text,
    };
    if (parseMode) requestPayload.parse_mode = parseMode;

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    let response: Response;
    try {
      response = await fetchSafeOutbound(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (reason) {
      throw sanitizeTelegramFailure(reason, botToken);
    }

    let json: { ok?: boolean; error_code?: number; description?: string; result?: { message_id?: number | string } } | undefined;
    try {
      json = await response.json() as typeof json;
    } catch {
      // response could not be parsed as JSON
    }

    if (!response.ok || !json || json.ok !== true) {
      const errorCode = typeof json?.error_code === "number" ? json.error_code : response.status;
      const retryable = errorCode === 429 || errorCode >= 500;
      throw new NodeFailure(
        "HTTP_ERROR",
        `Telegram returned ${errorCode}.`,
        retryable,
        errorCode,
      );
    }

    const messageId = json?.result?.message_id !== undefined ? String(json.result.message_id) : undefined;

    return {
      delivered: true,
      provider: this.provider,
      destination: chatId,
      messageId,
      sentAt: new Date().toISOString(),
      mode: "live",
    };
  }
}
