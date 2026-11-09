import { z } from "zod";
import type { ConfigRules } from "./types";

export const slackWebhook: ConfigRules = {
  message: { schema: z.string().max(4000).refine((value) => Boolean(value.trim())), required: true, message: "Enter a message of at most 4,000 characters." },
};
