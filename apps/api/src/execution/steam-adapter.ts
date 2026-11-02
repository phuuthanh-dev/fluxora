import { NodeFailure } from "./node-failure";
import { readCredentialValue } from "./connector-config";

export function mockSteamSnapshot(steamId: string) {
  const ownedGames = [{ appid: 620, name: "Portal 2", playtime_forever: 1240 }, { appid: 1145360, name: "Hades", playtime_forever: 680 }];
  return {
    profile: { steamId, personaname: "Mock Steam Player", profileurl: `https://steamcommunity.com/profiles/${steamId}`, communityvisibilitystate: 3 },
    currentGame: null,
    ownedGames,
    recentGames: [{ appid: 620, name: "Portal 2", playtime_2weeks: 180, playtime_forever: 1240 }],
    achievements: null,
    summary: { totalGames: 42, topGames: topSteamGames(ownedGames) },
  };
}

export async function steamSnapshot(credential: Record<string, unknown>, config: Record<string, unknown>) {
  const apiKey = readCredentialValue(credential, "apiKey");
  const steamId = typeof config.steamId === "string" && config.steamId ? config.steamId : readCredentialValue(credential, "steamId");
  const base = "https://api.steampowered.com";
  const params = new URLSearchParams({ key: apiKey, steamids: steamId });
  const profileResponse = await fetch(`${base}/ISteamUser/GetPlayerSummaries/v0002/?${params}`, { signal: AbortSignal.timeout(15_000) });
  if (!profileResponse.ok) throw new NodeFailure("HTTP_ERROR", `Steam profile request returned ${profileResponse.status}.`, profileResponse.status === 429 || profileResponse.status >= 500, profileResponse.status);
  const profileJson = await profileResponse.json() as { response?: { players?: unknown[] } };
  const profile = profileJson.response?.players?.[0];
  if (!profile || typeof profile !== "object") throw new NodeFailure("STEAM_PROFILE_NOT_FOUND", "Steam did not return a public profile for this Steam ID.", false);
  const ownedGames = config.includeOwnedGames === false ? [] : await steamResponse<{ response?: { game_count?: number; games?: SteamGame[] } }>(
    `${base}/IPlayerService/GetOwnedGames/v0001/?${new URLSearchParams({ key: apiKey, steamid: steamId, include_appinfo: "1", include_played_free_games: "1" })}`,
    "owned games",
  ).then((body) => body.response?.games ?? []);
  const recentGames = config.includeRecentGames === false ? [] : await steamResponse<{ response?: { games?: SteamGame[] } }>(
    `${base}/IPlayerService/GetRecentlyPlayedGames/v0001/?${new URLSearchParams({ key: apiKey, steamid: steamId, format: "json" })}`,
    "recent games",
  ).then((body) => body.response?.games ?? []);
  const achievementAppId = typeof config.achievementAppId === "string" ? config.achievementAppId.trim() : "";
  const achievements = achievementAppId ? await steamAchievements(base, apiKey, steamId, achievementAppId) : null;
  const player = profile as Record<string, unknown>;
  const currentAppId = typeof player.gameid === "number" ? player.gameid : undefined;
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

async function steamResponse<T>(url: string, label: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new NodeFailure("HTTP_ERROR", `Steam ${label} request returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
  return response.json() as Promise<T>;
}

async function steamAchievements(base: string, apiKey: string, steamId: string, appId: string) {
  const response = await fetch(`${base}/ISteamUserStats/GetPlayerAchievements/v0001/?${new URLSearchParams({ key: apiKey, steamid: steamId, appid: appId, l: "english" })}`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) return null;
  const body = await response.json() as { playerstats?: unknown };
  return body.playerstats ?? null;
}

function topSteamGames(games: SteamGame[]) {
  return [...games].sort((left, right) => (right.playtime_forever ?? 0) - (left.playtime_forever ?? 0)).slice(0, 5).map((game) => ({ appId: game.appid ?? null, name: game.name ?? "Unknown", playtimeMinutes: game.playtime_forever ?? 0 }));
}
