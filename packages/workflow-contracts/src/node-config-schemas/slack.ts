import { z } from "zod";
import type { ConfigRules, FieldRule } from "./types";

const channel: FieldRule = { schema: z.string().regex(/^[A-Z][A-Z0-9]{2,63}$/), required: true, message: "Select a valid Slack channel." };

export const slackWebhook: ConfigRules = {
  message: { schema: z.string().max(4000).refine((value) => Boolean(value.trim())), required: true, message: "Enter a message of at most 4,000 characters." },
};

export const slackMessage: ConfigRules = {
  ...slackWebhook,
  channel,
};

export const slackTrigger: ConfigRules = {
  channel,
  event: { schema: z.enum(["message", "app_mention"]), required: true, message: "Choose a Slack event." },
};
