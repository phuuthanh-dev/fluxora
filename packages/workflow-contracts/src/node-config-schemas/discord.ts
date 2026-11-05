import { z } from "zod";
import type { ConfigRules } from "./types";

function parseOptional(value: unknown): unknown {
  if (value === null || value === "") return undefined;
  if (typeof value !== "string") return value;
  if (!value.trim()) return undefined;
  try { return JSON.parse(value); } catch { return Symbol("invalid"); }
}
const embeds = z.unknown().refine((value) => { if (value === undefined) return false; const parsed = parseOptional(value); return parsed === undefined || Array.isArray(parsed); });
const mentions = z.unknown().refine((value) => {
  if (value === undefined) return false;
  const parsed = parseOptional(value);
  if (parsed === undefined) return true;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const item = parsed as Record<string, unknown>;
  if (Object.keys(item).some((key) => !["parse", "roles", "users", "replied_user"].includes(key))) return false;
  if (item.parse !== undefined && (!Array.isArray(item.parse) || !item.parse.every((v) => ["roles", "users", "everyone"].includes(v)))) return false;
  if ([item.roles, item.users].some((list) => list !== undefined && (!Array.isArray(list) || !list.every((v) => typeof v === "string" && !!v.trim())))) return false;
  return item.replied_user === undefined || typeof item.replied_user === "boolean";
});
const hasEmbeds = (value: unknown) => { const parsed = parseOptional(value); return Array.isArray(parsed) && parsed.length > 0; };
export const discordWebhook: ConfigRules = {
  content: { schema: z.string(), when: (config) => Object.hasOwn(config, "content") || (!Object.hasOwn(config, "message") && !hasEmbeds(config.embeds)), dependsOn: ["message", "embeds"], required: true, matches: (value, config) => typeof value === "string" && (!!value.trim() || hasEmbeds(config.embeds)), message: "Enter a message or add an embed." },
  message: { schema: z.string(), when: (config) => !Object.hasOwn(config, "content"), dependsOn: ["content", "embeds"], matches: (value, config) => typeof value === "string" && (!!value.trim() || hasEmbeds(config.embeds)), message: "Enter a message or add an embed." },
  username: { schema: z.string(), message: "Enter a valid Discord username." },
  avatarUrl: { schema: z.string(), message: "Enter a valid Discord avatar URL." },
  embeds: { schema: embeds, message: "Discord embeds must be a JSON array." },
  allowedMentions: { schema: mentions, message: "Enter valid Discord allowed mentions." },
};
