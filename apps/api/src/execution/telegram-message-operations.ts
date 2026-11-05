import { CredentialProvider } from "@prisma/client";
import { nodeConfigIssues } from "@workflow/contracts";
import type { CredentialService } from "../credentials/credential.service";
import { readTelegramDestinationType, validateTelegramDestination } from "../notifications/telegram-destination";
import { NodeFailure } from "./node-failure";
import { fetchSafeOutboundWrite } from "./outbound-url-policy";
import { readBoundedProviderJson } from "./provider-json";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
type Operation = "reply" | "edit";
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const uncertain = () => new NodeFailure("DELIVERY_UNCERTAIN", "Telegram may have accepted the request. Check the chat before retrying.", false);

function positiveId(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : typeof value === "number" && Number.isSafeInteger(value) ? String(value) : "";
  const parsed = Number(text);
  if (!/^[1-9]\d{0,15}$/.test(text) || !Number.isSafeInteger(parsed)) throw new NodeFailure("INVALID_CONFIGURATION", `${label} must be a positive numeric ID.`, false);
  return parsed;
}

/** Sends only the selected operation. A transport/receipt failure after a POST
 * is ambiguous; automatic retry is never permitted for these operations. */
export async function executeTelegramMessageOperation(operation: Operation, config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutboundWrite) {
  const issue = nodeConfigIssues(operation === "reply" ? "action.telegram.reply" : "action.telegram.edit-message", config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_CONFIGURATION", issue.message, false);
  const chatId = typeof config.chatId === "string" ? config.chatId.trim() : typeof config.chatId === "number" && Number.isSafeInteger(config.chatId) ? String(config.chatId) : "";
  const numericChat = /^-?[1-9]\d{0,15}$/.test(chatId) && Number.isSafeInteger(Number(chatId));
  if (!numericChat && !/^@[A-Za-z0-9_]{5,32}$/.test(chatId)) throw new NodeFailure("INVALID_CONFIGURATION", "Enter a numeric Telegram chat ID or a public @channel username.", false);
  const destinationType = readTelegramDestinationType(config.destinationType);
  const threadId = config.messageThreadId === undefined || config.messageThreadId === null || config.messageThreadId === "" ? undefined : positiveId(config.messageThreadId, "Topic ID");
  if (operation === "edit" && threadId !== undefined) throw new NodeFailure("INVALID_CONFIGURATION", "A topic ID is not used when editing a message.", false);
  validateTelegramDestination(destinationType, chatId, threadId === undefined ? undefined : String(threadId));
  const messageId = positiveId(config.messageId, "Message ID");
  const text = typeof config.text === "string" ? config.text : "";
  if (!text.trim() || text.length > 4096) throw new NodeFailure("INVALID_CONFIGURATION", "Enter message text of 1 to 4,096 characters.", false);
  const parseMode = config.parseMode === undefined || config.parseMode === "" ? undefined : config.parseMode;
  if (parseMode !== undefined && parseMode !== "Markdown" && parseMode !== "MarkdownV2" && parseMode !== "HTML") throw new NodeFailure("INVALID_CONFIGURATION", "Choose a supported Telegram text format.", false);
  const result = (id: string, destination: string) => ({ status: "succeeded" as const, route: "success" as const, output: { delivered: true, provider: "telegram", operation, destination, messageId: id, sentAt: new Date().toISOString(), mode } });
  if (mode === "mock") return result(operation === "reply" ? "123456" : String(messageId), chatId);
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Telegram connection.", false);
  const credential = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.TELEGRAM_BOT);
  const token = credential.botToken;
  if (typeof token !== "string" || !/^\d{1,20}:[A-Za-z0-9_-]{1,200}$/.test(token)) throw new NodeFailure("CREDENTIAL_INVALID", "Telegram connection is invalid.", false);
  const body: Record<string, unknown> = { chat_id: chatId, text, ...(parseMode ? { parse_mode: parseMode } : {}) };
  if (operation === "reply") {
    body.reply_parameters = { message_id: messageId, allow_sending_without_reply: false };
    if (threadId !== undefined) body.message_thread_id = threadId;
  } else body.message_id = messageId;
  let response: Response;
  try { response = await transport(`https://api.telegram.org/bot${token}/${operation === "reply" ? "sendMessage" : "editMessageText"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) }); }
  catch { throw uncertain(); }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 408 || response.status === 429 || response.status >= 500 || response.status < 400) throw uncertain();
    throw new NodeFailure("HTTP_ERROR", `Telegram returned ${response.status}.`, false, response.status);
  }
  let value: Record<string, unknown> | undefined;
  try { value = object(await readBoundedProviderJson(response)); } catch { throw uncertain(); }
  if (value?.ok === false && typeof value.error_code === "number" && Number.isInteger(value.error_code) && value.error_code >= 400 && value.error_code < 500 && value.error_code !== 408 && value.error_code !== 429) throw new NodeFailure("HTTP_ERROR", `Telegram returned ${value.error_code}.`, false, value.error_code);
  const receipt = object(value?.result), chat = object(receipt?.chat), actualId = receipt?.message_id, actualChat = chat?.id;
  if (value?.ok !== true || typeof actualId !== "number" || !Number.isSafeInteger(actualId) || actualId <= 0 || typeof actualChat !== "number" || !Number.isSafeInteger(actualChat) || (numericChat && String(actualChat) !== chatId) || (operation === "edit" && actualId !== messageId)) throw uncertain();
  return result(String(actualId), String(actualChat));
}
