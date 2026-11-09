import { CredentialProvider } from "@prisma/client";
import { nodeConfigIssues } from "@workflow/contracts";
import type { CredentialService } from "../credentials/credential.service";
import type { RunMode, NodeResult } from "./node-executor-contract";
import { NodeFailure } from "./node-failure";
import { readCredentialId } from "./connector-config";
import { defaultNotificationDispatcher, parseDiscordAllowedMentions, parseDiscordEmbeds, readTelegramDestinationType, validateTelegramDestination } from "../notifications";

export async function executeGoogleChatWebhook(config: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService): Promise<NodeResult> {
  const issue = nodeConfigIssues("action.google-chat.webhook", config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_CONFIGURATION", issue.message, false);
  const message = typeof config.message === "string" ? config.message : "";
  if (!message.trim()) throw new NodeFailure("INVALID_CONFIGURATION", "Google Chat message is required.", false);
  const credential = mode === "live" ? await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.GOOGLE_CHAT_WEBHOOK) : undefined;
  const output = await defaultNotificationDispatcher.dispatch({
    provider: "google_chat",
    message,
    content: message,
  }, credential, mode);
  return { status: "succeeded", output, route: "success" };
}

export async function executeSlackWebhook(config: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService): Promise<NodeResult> {
  const issue = nodeConfigIssues("action.slack.webhook", config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_CONFIGURATION", issue.message, false);
  const credential = mode === "live" ? await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.SLACK_WEBHOOK) : undefined;
  const output = await defaultNotificationDispatcher.dispatch({ provider: "slack", message: String(config.message ?? "") }, credential, mode);
  return { status: "succeeded", output, route: "success" };
}

export async function executeDiscordWebhook(config: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService): Promise<NodeResult> {
  const content = typeof config.content === "string" ? config.content : (typeof config.message === "string" ? config.message : "");
  const username = typeof config.username === "string" && config.username.trim() ? config.username.trim() : undefined;
  const avatarUrl = typeof config.avatarUrl === "string" && config.avatarUrl.trim() ? config.avatarUrl.trim() : undefined;
  const embeds = config.embeds;
  const allowedMentions = config.allowedMentions;

  if (!content.trim() && (!embeds || (Array.isArray(embeds) && embeds.length === 0))) throw new NodeFailure("INVALID_CONFIGURATION", "Discord message content is required.", false);
  parseDiscordEmbeds(embeds);
  parseDiscordAllowedMentions(allowedMentions);
  const issue = nodeConfigIssues("action.discord.webhook", config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_CONFIGURATION", issue.message, false);
  const credential = mode === "live" ? await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.DISCORD_WEBHOOK) : undefined;

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

export async function executeTelegramMessage(config: Record<string, unknown>, mode: RunMode, workspaceId: string, credentials: CredentialService): Promise<NodeResult> {
  const text = typeof config.text === "string" ? config.text : (typeof config.message === "string" ? config.message : "");
  const parseMode = typeof config.parseMode === "string" && config.parseMode.trim() ? config.parseMode.trim() : undefined;
  const configChatId = typeof config.chatId === "string" && config.chatId.trim() ? config.chatId.trim() : (typeof config.chatId === "number" ? String(config.chatId) : undefined);
  const destinationType = readTelegramDestinationType(config.destinationType);
  const messageThreadId = typeof config.messageThreadId === "string" && config.messageThreadId.trim()
    ? config.messageThreadId.trim()
    : (typeof config.messageThreadId === "number" ? String(config.messageThreadId) : undefined);

  if (!text.trim()) throw new NodeFailure("INVALID_CONFIGURATION", "Telegram message text is required.", false);
  validateTelegramDestination(destinationType, configChatId, messageThreadId);
  const issue = nodeConfigIssues("action.telegram.message", config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_CONFIGURATION", issue.message, false);
  const credential = mode === "live" ? await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.TELEGRAM_BOT) : undefined;
  if (!configChatId && credential?.chatId !== undefined && credential.chatId !== null) {
    validateTelegramDestination(destinationType, String(credential.chatId).trim() || undefined, messageThreadId);
  }

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
