import { NodeFailure } from "../execution/node-failure";

export const telegramDestinationTypes = ["dm", "group", "supergroup", "channel"] as const;
export type TelegramDestinationType = (typeof telegramDestinationTypes)[number];

export function readTelegramDestinationType(value: unknown): TelegramDestinationType | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string" && telegramDestinationTypes.includes(value as TelegramDestinationType)) {
    return value as TelegramDestinationType;
  }
  throw new NodeFailure("INVALID_CONFIGURATION", "Telegram destination type must be dm, group, supergroup, or channel.", false);
}
export function validateTelegramDestination(
  destinationType: TelegramDestinationType | undefined,
  chatId: string | undefined,
  messageThreadId: string | undefined,
): void {
  if (!destinationType) return;
  // Leave the final required-value check to the adapter so legacy credentials
  // containing chatId can continue to work while new nodes prefer node config.
  if (!chatId) return;

  const isNumericChatId = /^-?\d+$/.test(chatId);
  const isPositiveNumericChatId = /^\d+$/.test(chatId);
  const isPublicChannelUsername = /^@[A-Za-z0-9_]{5,32}$/.test(chatId);

  if (destinationType === "dm" && !isPositiveNumericChatId) {
    throw new NodeFailure("INVALID_CONFIGURATION", "Telegram DM chat ID must be a positive numeric user ID.", false);
  }
  if ((destinationType === "group" || destinationType === "supergroup") && (!isNumericChatId || !chatId.startsWith("-"))) {
    throw new NodeFailure("INVALID_CONFIGURATION", "Telegram group chat ID must be a negative numeric ID.", false);
  }
  if (destinationType === "channel" && !((isNumericChatId && chatId.startsWith("-")) || isPublicChannelUsername)) {
    throw new NodeFailure("INVALID_CONFIGURATION", "Telegram channel must use a negative numeric ID or a public @username.", false);
  }
  if (messageThreadId && (destinationType !== "supergroup" || !/^[1-9]\d*$/.test(messageThreadId))) {
    throw new NodeFailure("INVALID_CONFIGURATION", "Telegram topic / thread ID is only supported as a positive number on a supergroup.", false);
  }
}
