import { z } from "zod";
import type { ConfigRules } from "./types";

const idText = (value: string | number) => String(value).trim();
const numericId = z.union([z.string(), z.number()]).refine((value) => /^[1-9]\d{0,15}$/.test(idText(value)) && Number.isSafeInteger(Number(idText(value))));
const chatId = z.union([z.string(), z.number()]).refine((value) => {
  const text = idText(value);
  return (/^-?[1-9]\d{0,15}$/.test(text) && Number.isSafeInteger(Number(text))) || /^@[A-Za-z0-9_]{5,32}$/.test(text);
});
const text = z.string().refine((value) => !!value.trim() && value.length <= 4096);
const destination = { schema: z.union([z.enum(["dm", "group", "supergroup", "channel"]), z.literal(""), z.null()]), message: "Choose a supported Telegram destination type." };
const parseMode = { schema: z.enum(["", "Markdown", "MarkdownV2", "HTML"]), message: "Choose a supported Telegram text format." };
const allowedForDestination = (value: unknown, config: Record<string, unknown>) => {
  if (typeof value !== "string" && typeof value !== "number") return false;
  const id = idText(value), type = config.destinationType;
  if (!type) return true;
  if (type === "dm") return /^[1-9]\d*$/.test(id);
  if (type === "group" || type === "supergroup") return /^-[1-9]\d*$/.test(id);
  return type === "channel" && (/^-[1-9]\d*$/.test(id) || /^@[A-Za-z0-9_]{5,32}$/.test(id));
};
const thread = {
  schema: z.union([numericId, z.literal(""), z.null()]),
  dependsOn: ["destinationType"],
  matches: (value: unknown, config: Record<string, unknown>) => value === "" || value === null || !config.destinationType || config.destinationType === "supergroup",
  message: "A topic ID must be a positive number on a supergroup.",
};
const replyFields: ConfigRules = {
  chatId: { schema: chatId, required: true, dependsOn: ["destinationType"], matches: allowedForDestination, message: "Enter a valid chat ID for the selected destination." },
  destinationType: destination,
  messageId: { schema: numericId, required: true, message: "Enter a positive Telegram message ID." },
  text: { schema: text, required: true, message: "Enter message text of 1 to 4,096 characters." },
  parseMode,
};
export const telegramReply: ConfigRules = { ...replyFields, messageThreadId: thread };
export const telegramEdit: ConfigRules = { ...replyFields, messageThreadId: { schema: z.union([z.literal(""), z.null()]), message: "A topic ID is not used when editing a message." } };
export const telegramSend: ConfigRules = {
  chatId: { schema: z.union([chatId, z.literal(""), z.null()]), dependsOn: ["destinationType"], matches: (value, config) => value === "" || value === null || allowedForDestination(value, config), message: "Enter a valid chat ID for the selected destination." },
  destinationType: destination,
  messageThreadId: thread,
  text: { schema: text, required: true, when: (config) => typeof config.text === "string" || !Object.hasOwn(config, "message"), dependsOn: ["text", "message"], message: "Telegram message text is required." },
  message: { schema: text, when: (config) => typeof config.text !== "string", dependsOn: ["text"], message: "Telegram message text is required." },
  parseMode,
};
