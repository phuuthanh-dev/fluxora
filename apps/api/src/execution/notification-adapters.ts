import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import type { RunMode, NodeResult } from "./node-executor-contract";
import { NodeFailure } from "./node-failure";
import { readCredentialId } from "./connector-config";
import { defaultNotificationDispatcher, readTelegramDestinationType, validateTelegramDestination } from "../notifications";

export async function executeGoogleChatWebhook(config: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService): Promise<NodeResult> {
  const message = typeof config.message === "string" ? config.message : "";
  if (mode === "live") {
    if (!message.trim()) {
      throw new NodeFailure("INVALID_CONFIGURATION", "Google Chat message is required.", false);
    }
    const credential = await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.GOOGLE_CHAT_WEBHOOK);
    const output = await defaultNotificationDispatcher.dispatch({
      provider: "google_chat",
      message,
      content: message,
    }, credential, mode);
    return { status: "succeeded", output, route: "success" };
  }
  const output = await defaultNotificationDispatcher.dispatch({
    provider: "google_chat",
    message,
    content: message,
  }, undefined, mode);
  return { status: "succeeded", output, route: "success" };
}

export async function executeDiscordWebhook(config: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService): Promise<NodeResult> {
  const content = typeof config.content === "string" ? config.content : (typeof config.message === "string" ? config.message : "");
  const username = typeof config.username === "string" && config.username.trim() ? config.username.trim() : undefined;
  const avatarUrl = typeof config.avatarUrl === "string" && config.avatarUrl.trim() ? config.avatarUrl.trim() : undefined;
  const embeds = config.embeds;
  const allowedMentions = config.allowedMentions;

  if (mode === "live") {
    if (!content.trim() && (!embeds || (Array.isArray(embeds) && embeds.length === 0))) {
      throw new NodeFailure("INVALID_CONFIGURATION", "Discord message content is required.", false);
    }
    const credential = await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.DISCORD_WEBHOOK);
    const output = await defaultNotificationDispatcher.dispatch({
      provider: "discord",
      content,
      username,
      avatarUrl,
      embeds,
      allowedMentions,
    }, credential, mode);
    return { status: "succeeded", output, route: "success" };
  }

  const output = await defaultNotificationDispatcher.dispatch({
    provider: "discord",
    content,
    username,
    avatarUrl,
    embeds,
    allowedMentions,
  }, undefined, mode);
  return { status: "succeeded", output, route: "success" };
}

export async function executeTelegramMessage(config: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService): Promise<NodeResult> {
  const text = typeof config.text === "string" ? config.text : (typeof config.message === "string" ? config.message : "");
  const parseMode = typeof config.parseMode === "string" && config.parseMode.trim() ? config.parseMode.trim() : undefined;
  const configChatId = typeof config.chatId === "string" && config.chatId.trim() ? config.chatId.trim() : (typeof config.chatId === "number" ? String(config.chatId) : undefined);
  const destinationType = readTelegramDestinationType(config.destinationType);
  const messageThreadId = typeof config.messageThreadId === "string" && config.messageThreadId.trim()
    ? config.messageThreadId.trim()
    : (typeof config.messageThreadId === "number" ? String(config.messageThreadId) : undefined);

  if (mode === "live") {
    if (!text.trim()) {
      throw new NodeFailure("INVALID_CONFIGURATION", "Telegram message text is required.", false);
    }
    const credential = await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.TELEGRAM_BOT);
    validateTelegramDestination(destinationType, configChatId, messageThreadId);
    const output = await defaultNotificationDispatcher.dispatch({
      provider: "telegram",
      text,
      chatId: configChatId,
      destination: configChatId,
      parseMode,
      messageThreadId,
    }, credential, mode);
    return { status: "succeeded", output, route: "success" };
  }

  const output = await defaultNotificationDispatcher.dispatch({
    provider: "telegram",
    text,
    chatId: configChatId,
    destination: configChatId,
    parseMode,
    messageThreadId,
  }, undefined, mode);
  return { status: "succeeded", output, route: "success" };
}
