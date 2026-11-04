import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { readCredentialValue } from "./connector-config";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { readProviderJson } from "./provider-request-policy";

type SnapshotTransport = (url: string, init: RequestInit) => Promise<Response>;
// Steam libraries can be large; bound the legacy snapshot without truncating it.
const snapshotResponseLimit = 5_000_000;

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

export async function steamSnapshot(credential: Record<string, unknown>, config: Record<string, unknown>, transport: SnapshotTransport = fetchSafeOutbound) {
  const apiKey = readCredentialValue(credential, "apiKey");
  const steamId = typeof config.steamId === "string" && config.steamId ? config.steamId : readCredentialValue(credential, "steamId");
  const base = "https://api.steampowered.com";
  const params = new URLSearchParams({ key: apiKey, steamids: steamId });
  const profileJson = await steamResponse<{ response?: { players?: unknown[] } }>(`${base}/ISteamUser/GetPlayerSummaries/v0002/?${params}`, "profile", apiKey, transport);
  const profile = profileJson?.response?.players?.[0];
  if (!profile || typeof profile !== "object") throw new NodeFailure("STEAM_PROFILE_NOT_FOUND", "Steam did not return a public profile for this Steam ID.", false);
  const ownedGames = config.includeOwnedGames === false ? [] : await steamResponse<{ response?: { game_count?: number; games?: SteamGame[] } }>(
    `${base}/IPlayerService/GetOwnedGames/v0001/?${new URLSearchParams({ key: apiKey, steamid: steamId, include_appinfo: "1", include_played_free_games: "1" })}`,
    "owned games", apiKey, transport,
  ).then((body) => body?.response?.games ?? []);
  const recentGames = config.includeRecentGames === false ? [] : await steamResponse<{ response?: { games?: SteamGame[] } }>(
    `${base}/IPlayerService/GetRecentlyPlayedGames/v0001/?${new URLSearchParams({ key: apiKey, steamid: steamId, format: "json" })}`,
    "recent games", apiKey, transport,
  ).then((body) => body?.response?.games ?? []);
  const achievementAppId = typeof config.achievementAppId === "string" ? config.achievementAppId.trim() : "";
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
