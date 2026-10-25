import { NodeFailure } from "../execution/node-failure";
import { GoogleChatNotificationAdapter } from "./google-chat.adapter";
import { DiscordNotificationAdapter } from "./discord.adapter";
import { TelegramNotificationAdapter } from "./telegram.adapter";
import { HttpWebhookNotificationAdapter } from "./http-webhook.adapter";
import type { NotificationAdapter, NotificationPayload, NotificationProvider, NormalizedDeliveryResult } from "./notification-contracts";

export class NotificationDispatcher {
  private readonly adapters = new Map<NotificationProvider, NotificationAdapter>();

  constructor(adapters: NotificationAdapter[] = []) {
    for (const adapter of adapters) {
      this.adapters.set(adapter.provider, adapter);
    }
  }

  register(adapter: NotificationAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  getAdapter(provider: NotificationProvider): NotificationAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new NodeFailure("INVALID_CONFIGURATION", `No notification adapter registered for provider: ${provider}`, false);
    }
    return adapter;
  }

  async dispatch(
    payload: NotificationPayload,
    credentialData?: Record<string, unknown>,
    mode: "mock" | "live" = "live",
  ): Promise<NormalizedDeliveryResult> {
    const adapter = this.getAdapter(payload.provider);
    return adapter.send(payload, credentialData, mode);
  }
}

export function createDefaultNotificationDispatcher(): NotificationDispatcher {
  return new NotificationDispatcher([
    new GoogleChatNotificationAdapter(),
    new DiscordNotificationAdapter(),
    new TelegramNotificationAdapter(),
    new HttpWebhookNotificationAdapter(),
  ]);
}

export const defaultNotificationDispatcher = createDefaultNotificationDispatcher();
