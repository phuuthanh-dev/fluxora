import { z } from "zod";
import type { ConfigRules } from "./types";

export const redditList: ConfigRules = {
  subreddit: { schema: z.string().refine((value) => /^[A-Za-z0-9_]{3,21}$/.test(value.trim().replace(/^r\//i, ""))), required: true, message: "Enter a valid subreddit name." },
  sort: { schema: z.enum(["new", "hot"]), message: "Choose a valid sort order." },
  limit: { schema: z.number().int().min(1).max(100), message: "Choose a limit between 1 and 100." },
};
