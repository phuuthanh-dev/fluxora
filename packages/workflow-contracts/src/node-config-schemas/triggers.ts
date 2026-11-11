import { z } from "zod";
import type { ConfigRules } from "./types";
import { isSteamAppId } from "./steam";
import { isCalendarResourceId } from "./google-calendar";

const interval = z.union([z.literal("1"), z.literal("5"), z.literal("15"), z.literal("60"), z.literal(1), z.literal(5), z.literal(15), z.literal(60)]);
const publicFeed = z.string().refine((value) => {
  if (!value.trim() || value.length > 2048) return false;
  try { const url = new URL(value.trim()); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
});
const webhook = { path: { schema: z.string(), message: "Enter a valid webhook path." }, secretRequired: { schema: z.boolean(), message: "Choose whether a webhook secret is required." } };
export const manual: ConfigRules = { testData: { schema: z.record(z.string(), z.unknown()), message: "Manual test data must be an object." } };
export const cron: ConfigRules = {
  expression: { schema: z.string().refine((value) => !!value.trim()), required: true, message: "Enter a cron expression." },
  timezone: { schema: z.string().refine((value) => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return !!value; } catch { return false; } }), message: "Enter a valid timezone." },
};
export const webhookTrigger: ConfigRules = webhook;
export const rssTrigger: ConfigRules = { url: { schema: publicFeed, required: true, message: "Enter a public feed URL." }, pollMinutes: { schema: interval, message: "Choose a supported polling interval." } };
export const steamNewsTrigger: ConfigRules = { appId: { schema: z.string().refine(isSteamAppId), required: true, message: "Enter a valid Steam game App ID." }, pollMinutes: { schema: interval, message: "Choose a supported polling interval." } };
export const gmailTrigger: ConfigRules = {
  mailbox: { schema: z.enum(["all", "inbox"]), message: "Choose a Gmail mailbox." },
  labelId: { schema: z.string().refine((value) => !value || /^[A-Za-z0-9_-]{1,128}$/.test(value)), message: "Choose a valid Gmail label." },
  sender: { schema: z.string().refine((value) => value.trim().length <= 320), message: "Enter a sender filter up to 320 characters." },
  subject: { schema: z.string().refine((value) => value.trim().length <= 500), message: "Enter a subject filter up to 500 characters." },
  pollMinutes: { schema: interval, message: "Choose a supported polling interval." },
  maxMessages: { schema: z.union([z.literal("10"), z.literal("25"), z.literal("50"), z.literal(10), z.literal(25), z.literal(50)]), message: "Choose a supported message limit." },
};
export const calendarTrigger: ConfigRules = {
  calendarId: { schema: z.string().refine(isCalendarResourceId), required: true, message: "Select a valid Google Calendar." },
  event: { schema: z.enum(["created", "updated"]), required: true, message: "Choose whether to monitor created or updated events." },
  pollMinutes: { schema: interval, message: "Choose a supported polling interval." },
};
export const notionTrigger: ConfigRules = {
  resourceId: { schema: z.string().regex(/^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i), required: true, message: "Choose a Notion data source." },
  event: { schema: z.enum(["created", "updated"]), required: true, message: "Choose a page event." },
  pollMinutes: { schema: interval, message: "Choose a supported polling interval." },
};
export const driveTrigger: ConfigRules = {
  resourceId: { schema: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/), required: true, message: "Choose a Drive file or folder." },
  resourceType: { schema: z.enum(["file", "folder"]), required: true, message: "Choose a file or folder." },
  event: { schema: z.enum(["created", "updated"]), required: true, dependsOn: ["resourceType"], matches: (value, config) => config.resourceType !== "file" || value === "updated", message: "Choose a folder for created files, or updated for an existing file." },
  pollMinutes: { schema: interval, message: "Choose a supported polling interval." },
};
export const telegramTrigger: ConfigRules = {
  event: { schema: z.enum(["all", "message", "channel_post", "callback_query"]), required: true, message: "Choose a supported Telegram event." },
  chatMode: { schema: z.enum(["all", "allowlist"]), required: true, message: "Choose an allowed-chat policy." },
  allowedChatIds: { schema: z.string().refine((value) => {
    const ids = value.split(",").map((id) => id.trim());
    return ids.length > 0 && ids.length <= 100 && new Set(ids).size === ids.length && ids.every((id) => /^-?[1-9]\d{0,15}$/.test(id) && Number.isSafeInteger(Number(id)));
  }), required: true, when: (config) => config.chatMode === "allowlist", dependsOn: ["chatMode"], message: "Enter a unique list of valid chat IDs." },
};
const providerId = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
export const vercelTrigger: ConfigRules = {
  team: { schema: providerId, required: true, message: "Choose a Vercel account or team." },
  project: { schema: providerId, required: true, message: "Choose a Vercel project." },
  event: { schema: z.enum(["deployment.created", "deployment.canceled", "deployment.ready", "deployment.succeeded", "deployment.error"]), required: true, message: "Choose a deployment event." },
};
export const trelloTrigger: ConfigRules = {
  boardId: { schema: z.string().regex(/^[a-f0-9]{24}$/i), required: true, message: "Choose a Trello board." },
  action: { schema: z.enum(["all", "createCard", "updateCard", "commentCard", "deleteCard"]), required: true, message: "Choose a Trello event." },
};
export const sentryTrigger: ConfigRules = {
  installationId: { schema: z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i), required: true, message: "Choose a Sentry integration installation." },
  project: { schema: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/i), required: true, message: "Choose a Sentry project." },
};
export const uptimeTrigger: ConfigRules = {
  monitorId: { schema: z.string().refine((value) => value === "" || /^[A-Za-z0-9_-]{1,100}$/.test(value)), message: "Enter a valid monitor ID." },
  statusFilter: { schema: z.enum(["any", "0", "1", "2", "3"]), message: "Choose an alert status." },
};
export const githubTrigger: ConfigRules = {
  repository: { schema: z.string().refine((value) => {
    if (!value) return true;
    const parts = value.trim().split("/");
    return parts.length === 2 && parts.every((part) => /^[A-Za-z0-9_.-]{1,100}$/.test(part) && part !== "." && part !== "..");
  }), message: "Choose a valid GitHub repository." },
};
