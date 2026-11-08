import { z } from "zod";
import type { ConfigRules } from "./types";

export function isSteamId(value: string): boolean {
  return /^\d{1,20}$/.test(value) && BigInt(value) > 0n && BigInt(value) <= 18446744073709551615n;
}

export function isSteamAppId(value: string): boolean {
  return /^[1-9]\d{0,9}$/.test(value) && Number(value) <= 4294967295;
}

export function parseSteamVanity(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let vanity = value.trim();
  if (/^https?:\/\//i.test(vanity)) {
    try {
      const url = new URL(vanity);
      const match = /^\/id\/([^/]+)\/?$/.exec(url.pathname);
      if (url.protocol !== "https:" || url.hostname !== "steamcommunity.com" || url.username || url.password || url.port || url.search || url.hash || !match) return undefined;
      vanity = decodeURIComponent(match[1]!);
    } catch { return undefined; }
  }
  return /^[A-Za-z0-9_-]{2,64}$/.test(vanity) ? vanity : undefined;
}

const steamOperations = ["profile", "friends", "badges", "resolveVanity", "ownedGames", "recentGames", "achievements", "gameNews"] as const;
const selectedSteamOperation = (config: Record<string, unknown>) => Object.hasOwn(config, "operation") ? config.operation : "profile";

export const steamSnapshot: ConfigRules = {
  steamId: { schema: z.string().refine((value) => !value.trim() || isSteamId(value.trim())), message: "Enter a valid Steam ID 64 as text." },
  includeOwnedGames: { schema: z.boolean(), message: "Choose whether to include owned games." },
  includeRecentGames: { schema: z.boolean(), message: "Choose whether to include recently played games." },
  achievementAppId: { schema: z.string().refine((value) => !value.trim() || isSteamAppId(value.trim())), message: "Enter a valid Steam game App ID." },
};

export const steamOperation: ConfigRules = {
  operation: { schema: z.enum(steamOperations), message: "Choose a supported Steam operation." },
  steamId: { schema: z.string().refine((value) => !value.trim() || isSteamId(value.trim())), message: "Enter a valid Steam ID 64 as text.", when: (config) => !["resolveVanity", "gameNews"].includes(String(selectedSteamOperation(config))) },
  includePlayedFreeGames: { schema: z.boolean(), message: "Choose whether to include played free games.", when: (config) => selectedSteamOperation(config) === "ownedGames" },
  vanity: { schema: z.string().refine((value) => parseSteamVanity(value) !== undefined), message: "Enter a valid Steam profile name or profile URL.", required: true, when: (config) => selectedSteamOperation(config) === "resolveVanity" },
  appId: { schema: z.string().refine(isSteamAppId), message: "Enter a valid Steam game App ID.", required: true, when: (config) => ["achievements", "gameNews"].includes(String(selectedSteamOperation(config))) },
  language: { schema: z.string().refine((value) => value === "" || /^[A-Za-z-]{1,32}$/.test(value)), message: "Enter a valid achievement language.", when: (config) => selectedSteamOperation(config) === "achievements" },
};

