export type NotificationProvider = "google_chat" | "discord" | "telegram" | "http_webhook";

export type DiscordAllowedMentions = {
  parse?: ("roles" | "users" | "everyone")[];
  roles?: string[];
  users?: string[];
  replied_user?: boolean;
};

export type NotificationPayload = {
  provider: NotificationProvider;
  destination?: string;
  message?: string;
  content?: string;
  text?: string;
  username?: string;
  avatarUrl?: string;
  embeds?: unknown[];
  allowedMentions?: DiscordAllowedMentions;
  parseMode?: string;
  approvalUrl?: string;
  chatId?: string | number;
  messageThreadId?: string | number;
};

export type NormalizedDeliveryResult = {
  delivered: boolean;
  provider: NotificationProvider;
  destination: string;
  messageId?: string;
  sentAt: string;
  mode: "mock" | "live";
};

export interface NotificationAdapter {
  readonly provider: NotificationProvider;
  send(
    payload: NotificationPayload,
    credentialData?: Record<string, unknown>,
    mode?: "mock" | "live",
  ): Promise<NormalizedDeliveryResult>;
}
