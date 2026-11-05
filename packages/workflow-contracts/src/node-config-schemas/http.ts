import { z } from "zod";
import type { ConfigRules } from "./types";

function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\//.test(value)) return false;
  try { new URL(value); return true; } catch { return false; }
}

export const httpRequest: ConfigRules = {
  url: { schema: z.string().refine(isHttpUrl), message: "Enter a valid HTTP or HTTPS URL.", required: true },
  method: { schema: z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/), message: "Enter a valid HTTP method." },
  headers: { schema: z.record(z.string(), z.string()), message: "HTTP headers must be an object with text values." },
  timeoutMs: { schema: z.number().int().min(1).max(60_000), message: "Timeout must be a whole number from 1 to 60,000 milliseconds." },
};
