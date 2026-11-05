import { z } from "zod";
import type { ConfigRules } from "./types";

const nonEmptyMessage = z.string().refine((value) => Boolean(value.trim()));
const space = z.string().refine((value) => /^spaces\/[A-Za-z0-9_-]{1,128}$/.test(value.trim()));
const message = { schema: z.string().max(10_000).refine((value) => Boolean(value.trim())), message: "Enter a message of at most 10,000 characters.", required: true };
const spaceRule = { schema: space, message: "Select a valid Google Chat space.", required: true };

export const googleChatWebhook: ConfigRules = {
  message: { schema: nonEmptyMessage, message: "Google Chat message is required.", required: true },
};
export const googleChatSend: ConfigRules = { space: spaceRule, message };
export const googleChatReply: ConfigRules = {
  ...googleChatSend,
  threadName: { schema: z.string().refine((value) => /^spaces\/[A-Za-z0-9_-]{1,128}\/threads\/[A-Za-z0-9._-]{1,256}$/.test(value.trim())), message: "Enter a thread belonging to the selected Google Chat space.", required: true, dependsOn: ["space"], matches: (value, config) => typeof value === "string" && typeof config.space === "string" && value.trim().startsWith(`${config.space.trim()}/threads/`) },
};
export const googleChatEdit: ConfigRules = {
  ...googleChatSend,
  messageName: { schema: z.string().refine((value) => /^spaces\/[A-Za-z0-9_-]{1,128}\/messages\/[A-Za-z0-9._-]{1,256}$/.test(value.trim())), message: "Enter a message belonging to the selected Google Chat space.", required: true, dependsOn: ["space"], matches: (value, config) => typeof value === "string" && typeof config.space === "string" && value.trim().startsWith(`${config.space.trim()}/messages/`) },
};
