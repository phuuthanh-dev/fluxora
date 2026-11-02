import { fetchSafeOutbound, wasOutboundRedirected } from "../execution/outbound-url-policy";
import { NodeFailure } from "../execution/node-failure";
import { readBoundedProviderJson } from "../execution/provider-json";
import { notificationReceiptFailure, notificationWriteFailure } from "./notification-write-failure";
import type { NotificationAdapter, NotificationPayload, NormalizedDeliveryResult } from "./notification-contracts";

export function sanitizeTelegramFailure(reason: unknown, token?: string): NodeFailure {
  const failure = notificationWriteFailure(reason);
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
    const messageThreadId = normalizeMessageThreadId(payload.messageThreadId);

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
    if (messageThreadId !== undefined) requestPayload.message_thread_id = messageThreadId;

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

    // A known HTTP rejection does not depend on its body being readable. In
    // particular, a contradictory body must not make an ambiguous 5xx retryable.
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new NodeFailure("HTTP_ERROR", `Telegram returned ${response.status}.`, response.status === 429 && !wasOutboundRedirected(response), response.status);
    }

    let json: { ok?: unknown; error_code?: unknown; result?: { message_id?: unknown } } | null;
    try {
      json = await readBoundedProviderJson(response) as typeof json;
    } catch {
      throw notificationReceiptFailure("Telegram");
    }

    if (json?.ok === false && typeof json.error_code === "number" && Number.isInteger(json.error_code) && json.error_code >= 400 && json.error_code <= 599) {
      const errorCode = json.error_code;
      throw new NodeFailure(
        "HTTP_ERROR",
        `Telegram returned ${errorCode}.`,
        errorCode === 429 && !wasOutboundRedirected(response),
        errorCode,
      );
    }

    const id = json?.result?.message_id;
    if (json?.ok !== true || !((typeof id === "string" && /^\d+$/.test(id)) || (typeof id === "number" && Number.isSafeInteger(id) && id >= 0))) {
      throw notificationReceiptFailure("Telegram");
    }
    const messageId = String(id);

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

function normalizeMessageThreadId(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const text = typeof value === "string" ? value.trim() : String(value);
  if (!/^[1-9]\d*$/.test(text)) {
    throw new NodeFailure("INVALID_CONFIGURATION", "Telegram topic / thread ID must be a positive integer.", false);
  }
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed)) {
    throw new NodeFailure("INVALID_CONFIGURATION", "Telegram topic / thread ID must be a safe integer.", false);
  }
  return parsed;
}
