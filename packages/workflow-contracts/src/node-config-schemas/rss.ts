import { z } from "zod";
import type { ConfigRules } from "./types";

export const rssRead: ConfigRules = {
  url: { schema: z.string().max(2048).refine((value) => {
    try { const url = new URL(value.trim()); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
  }), required: true, message: "Enter a valid public HTTP or HTTPS feed URL without embedded credentials." },
  limit: { schema: z.number().int().min(1).max(100), message: "Choose a limit between 1 and 100." },
};
