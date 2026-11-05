import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { readCredentialValue } from "./connector-config";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { readProviderJson } from "./provider-request-policy";
import { nodeConfigIssues } from "@workflow/contracts";
import { parseSteamResult, steamIdValue } from "./steam-operations";

type SnapshotTransport = (url: string, init: RequestInit) => Promise<Response>;
// Steam libraries can be large; bound the snapshot without truncating it.
const snapshotResponseLimit = 5_000_000;

function validateSnapshotOptions(config: Record<string, unknown>) {
  const issue = nodeConfigIssues("action.steam.account-snapshot", config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_INPUT", issue.message, false);
  return typeof config.achievementAppId === "string" ? config.achievementAppId.trim() : "";
}

export function mockSteamSnapshot(steamId: string, config: Record<string, unknown> = {}) {
  const achievementAppId = validateSnapshotOptions(config);
  const ownedGames = config.includeOwnedGames === false ? [] : [{ appid: 620, name: "Portal 2", playtime_forever: 1240 }, { appid: 1145360, name: "Hades", playtime_forever: 680 }];
  const recentGames = config.includeRecentGames === false ? [] : [{ appid: 620, name: "Portal 2", playtime_2weeks: 180, playtime_forever: 1240 }];
  const achievements = achievementAppId
    ? { steamID: steamId, achievements: [{ apiname: "EXAMPLE_ACHIEVEMENT", achieved: 1 }] } : null;
  return {
    profile: { steamid: steamId, personaname: "Mock Steam Player", profileurl: `https://steamcommunity.com/profiles/${steamId}`, communityvisibilitystate: 3 },
    currentGame: null,
    ownedGames,
    recentGames,
    achievements,
    summary: { totalGames: ownedGames.length, topGames: topSteamGames(ownedGames) },
  };
}

export async function steamSnapshot(credential: Record<string, unknown>, config: Record<string, unknown>, transport: SnapshotTransport = fetchSafeOutbound) {
  const achievementAppId = validateSnapshotOptions(config);
  const apiKey = readCredentialValue(credential, "apiKey");
  const configuredSteamId = typeof config.steamId === "string" ? config.steamId.trim() : "";
  const steamId = steamIdValue(configuredSteamId || readCredentialValue(credential, "steamId"));
  const base = "https://api.steampowered.com";
  const params = new URLSearchParams({ key: apiKey, steamids: steamId });
  const profileJson = await steamResponse<unknown>(`${base}/ISteamUser/GetPlayerSummaries/v0002/?${params}`, "profile", apiKey, transport);
  const profile = parseSteamResult("profile", profileJson, steamId);
  const ownedGames = config.includeOwnedGames === false ? [] : await steamResponse<unknown>(
    `${base}/IPlayerService/GetOwnedGames/v0001/?${new URLSearchParams({ key: apiKey, steamid: steamId, include_appinfo: "1", include_played_free_games: "1" })}`,
    "owned games", apiKey, transport,
  ).then((body) => (parseSteamResult("ownedGames", body, steamId).games ?? []) as SteamGame[]);
  const recentGames = config.includeRecentGames === false ? [] : await steamResponse<unknown>(
    `${base}/IPlayerService/GetRecentlyPlayedGames/v0001/?${new URLSearchParams({ key: apiKey, steamid: steamId, format: "json" })}`,
    "recent games", apiKey, transport,
  ).then((body) => (parseSteamResult("recentGames", body, steamId).games ?? []) as SteamGame[]);
  const achievements = achievementAppId ? await steamAchievements(base, apiKey, steamId, achievementAppId, transport) : null;
  const player = profile as Record<string, unknown>;
  const gameId = player.gameid;
  const parsedGameId = typeof gameId === "string" && /^\d+$/.test(gameId) ? Number(gameId) : gameId;
  const currentAppId = typeof parsedGameId === "number" && Number.isSafeInteger(parsedGameId) && parsedGameId > 0 ? parsedGameId : undefined;
  return {
    profile,
    currentGame: currentAppId ? { appId: currentAppId, name: typeof player.gameextrainfo === "string" ? player.gameextrainfo : "Unknown", serverIp: typeof player.gameserverip === "string" ? player.gameserverip : undefined } : null,
    ownedGames,
    recentGames,
    achievements,
    summary: { totalGames: ownedGames.length, topGames: topSteamGames(ownedGames) },
  };
}

type SteamGame = { appid?: number; name?: string; playtime_forever?: number; playtime_2weeks?: number; [key: string]: unknown };

async function steamResponse<T>(url: string, label: string, apiKey: string, transport: SnapshotTransport, optional = false): Promise<T | null> {
  let response: Response;
  try { response = await transport(url, { method: "GET", signal: AbortSignal.timeout(15_000) }); }
  catch (error) { throw nodeFailureFromOutboundPolicy(error); }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    if (optional) return null;
    throw new NodeFailure("HTTP_ERROR", `Steam ${label} request returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
  }
  const payload = await readProviderJson(response, "Steam", false, snapshotResponseLimit);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || JSON.stringify(payload).includes(apiKey)) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Steam returned an invalid or unsafe response.", false);
  return payload as T;
}

async function steamAchievements(base: string, apiKey: string, steamId: string, appId: string, transport: SnapshotTransport) {
  const body = await steamResponse<{ playerstats?: unknown }>(`${base}/ISteamUserStats/GetPlayerAchievements/v0001/?${new URLSearchParams({ key: apiKey, steamid: steamId, appid: appId, l: "english" })}`, "achievements", apiKey, transport, true);
  return body?.playerstats ?? null;
}

function topSteamGames(games: SteamGame[]) {
  return [...games].sort((left, right) => (right.playtime_forever ?? 0) - (left.playtime_forever ?? 0)).slice(0, 5).map((game) => ({ appId: game.appid ?? null, name: game.name ?? "Unknown", playtimeMinutes: game.playtime_forever ?? 0 }));
}
