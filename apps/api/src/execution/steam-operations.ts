import { CredentialProvider } from "@prisma/client";
import { isSteamAppId, isSteamId, nodeConfigIssues, parseSteamVanity } from "@workflow/contracts";
import type { CredentialService } from "../credentials/credential.service";
import { readCredentialId, readCredentialValue } from "./connector-config";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { readProviderJson } from "./provider-request-policy";

type SteamOperation = "profile" | "friends" | "badges" | "resolveVanity" | "ownedGames" | "recentGames" | "achievements";
type Transport = (url: string, init: RequestInit) => Promise<Response>;
type ObjectValue = Record<string, unknown>;
const operations: readonly SteamOperation[] = ["profile", "friends", "badges", "resolveVanity", "ownedGames", "recentGames", "achievements"];
const defaultSteamId = "76561198000000000";

function object(value: unknown): ObjectValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : undefined;
}
function invalidResponse(): never { throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Steam returned an unexpected response.", false); }
function unavailable(): never { throw new NodeFailure("STEAM_DATA_UNAVAILABLE", "Steam did not provide this data. Check the profile privacy settings and connection permissions.", false); }
export function steamIdValue(value: unknown): string {
  if (typeof value !== "string" || !isSteamId(value)) throw new NodeFailure("INVALID_INPUT", "Enter a valid Steam ID 64 as text.", false);
  return value;
}
function appIdValue(value: unknown): string {
  if (typeof value !== "string" || !isSteamAppId(value)) throw new NodeFailure("INVALID_INPUT", "Enter a valid Steam game App ID.", false);
  return value;
}
function vanityValue(value: unknown): string {
  const vanity = parseSteamVanity(value);
  if (!vanity) throw new NodeFailure("INVALID_INPUT", "Enter a valid Steam profile name or profile URL.", false);
  return vanity;
}
function selectedOperation(config: Record<string, unknown>): SteamOperation {
  const value = Object.hasOwn(config, "operation") ? config.operation : "profile";
  if (typeof value !== "string" || !operations.includes(value as SteamOperation)) throw new NodeFailure("INVALID_INPUT", "Choose a supported Steam operation.", false);
  return value as SteamOperation;
}
function prepare(config: Record<string, unknown>, credential: Record<string, unknown>, mock: boolean) {
  const operation = selectedOperation(config);
  const key = mock ? "mock-steam-key" : readCredentialValue(credential, "apiKey");
  if (key.length > 256 || /\s|[\u0000-\u001f\u007f]/.test(key)) throw new NodeFailure("CREDENTIAL_INVALID", "Steam connection requires a valid API key.", false);
  const params = new URLSearchParams({ key });
  let path: string;
  let selectedSteamId = defaultSteamId;
  if (operation === "resolveVanity") {
    params.set("vanityurl", vanityValue(config.vanity));
    path = "/ISteamUser/ResolveVanityURL/v1/";
  } else {
    if (Object.hasOwn(config, "steamId") && typeof config.steamId !== "string") throw new NodeFailure("INVALID_INPUT", "Enter a valid Steam ID 64 as text.", false);
    const rawId = typeof config.steamId === "string" && config.steamId.trim() ? config.steamId.trim() : credential.steamId ?? (mock ? defaultSteamId : undefined);
    const id = steamIdValue(rawId);
    selectedSteamId = id;
    params.set(operation === "profile" ? "steamids" : "steamid", id);
    switch (operation) {
      case "profile": path = "/ISteamUser/GetPlayerSummaries/v2/"; break;
      case "friends": path = "/ISteamUser/GetFriendList/v1/"; params.set("relationship", "friend"); break;
      case "badges": path = "/IPlayerService/GetBadges/v1/"; break;
      case "ownedGames":
        path = "/IPlayerService/GetOwnedGames/v1/";
        if (Object.hasOwn(config, "includePlayedFreeGames") && typeof config.includePlayedFreeGames !== "boolean") throw new NodeFailure("INVALID_INPUT", "Choose whether to include played free games.", false);
        params.set("include_appinfo", "1");
        if (config.includePlayedFreeGames === true) params.set("include_played_free_games", "1");
        break;
      case "recentGames": path = "/IPlayerService/GetRecentlyPlayedGames/v1/"; break;
      case "achievements": {
        path = "/ISteamUserStats/GetPlayerAchievements/v1/";
        params.set("appid", appIdValue(config.appId));
        const language = !Object.hasOwn(config, "language") || config.language === "" ? "english" : config.language;
        if (typeof language !== "string" || !/^[A-Za-z-]{1,32}$/.test(language)) throw new NodeFailure("INVALID_INPUT", "Enter a valid achievement language.", false);
        params.set("l", language.toLowerCase());
        break;
      }
    }
  }
  return { operation, key, selectedSteamId, url: `https://api.steampowered.com${path}?${params}` };
}

export function parseSteamResult(operation: SteamOperation, payload: unknown, expectedSteamId: string): ObjectValue {
  const root = object(payload);
  if (!root) return invalidResponse();
  if (operation === "friends") {
    const result = object(root.friendslist);
    if (!result) return unavailable();
    if (!Array.isArray(result.friends)) return invalidResponse();
    return result;
  }
  if (operation === "achievements") {
    const result = object(root.playerstats);
    if (!result) return invalidResponse();
    if (result.success === false) return unavailable();
    if (result.success !== true || (result.achievements !== undefined && !Array.isArray(result.achievements))) return invalidResponse();
    if (result.steamID !== undefined && result.steamID !== expectedSteamId) return invalidResponse();
    return result;
  }
  const result = object(root.response);
  if (!result) return invalidResponse();
  if (operation === "resolveVanity") {
    if (typeof result.success !== "number") return invalidResponse();
    if (result.success !== 1) throw new NodeFailure("STEAM_PROFILE_NOT_FOUND", "Steam could not resolve that profile name.", false);
    if (typeof result.steamid !== "string" || !/^\d{1,20}$/.test(result.steamid) || BigInt(result.steamid) === 0n || BigInt(result.steamid) > 18446744073709551615n) return invalidResponse();
    return result;
  }
  if (operation === "profile") {
    if (!Array.isArray(result.players)) return invalidResponse();
    const profile = object(result.players[0]);
    if (!profile) throw new NodeFailure("STEAM_PROFILE_NOT_FOUND", "Steam did not return a profile for that Steam ID.", false);
    if (profile.steamid !== expectedSteamId) return invalidResponse();
    return profile;
  }
  if (operation === "ownedGames" || operation === "recentGames") {
    const countKey = operation === "ownedGames" ? "game_count" : "total_count";
    if (result[countKey] === undefined && result.games === undefined) return unavailable();
    if (result.games !== undefined && !Array.isArray(result.games)) return invalidResponse();
    if (result[countKey] !== undefined && (!Number.isSafeInteger(result[countKey]) || (result[countKey] as number) < 0)) return invalidResponse();
    if (typeof result[countKey] === "number" && result[countKey] > 0 && !Array.isArray(result.games)) return invalidResponse();
    return result;
  }
  if (operation === "badges" && Object.keys(result).length === 0) return unavailable();
  if (operation === "badges" && result.badges !== undefined && !Array.isArray(result.badges)) return invalidResponse();
  return result;
}

export async function executeSteamOperation(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutbound) {
  const issue = nodeConfigIssues("action.steam", config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_INPUT", issue.message, false);
  const credential = mode === "live" ? await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.STEAM) : {};
  const { operation, key, selectedSteamId, url } = prepare(config, credential, mode === "mock");
  if (mode === "mock") {
    const mocks: Record<SteamOperation, ObjectValue> = {
      profile: { steamid: selectedSteamId, personaname: "Sample player" },
      friends: { friends: [] }, badges: { badges: [], player_level: 1 }, resolveVanity: { success: 1, steamid: defaultSteamId },
      ownedGames: { game_count: 1, games: [{ appid: 620, name: "Portal 2", playtime_forever: 120 }] },
      recentGames: { total_count: 1, games: [{ appid: 620, name: "Portal 2", playtime_2weeks: 60 }] },
      achievements: { success: true, achievements: [{ apiname: "SAMPLE", achieved: 1 }] },
    };
    return { status: "succeeded" as const, output: { operation, result: mocks[operation] }, route: "success" as const };
  }
  let response: Response;
  try { response = await transport(url, { method: "GET", signal: AbortSignal.timeout(15_000) }); }
  catch (error) { throw nodeFailureFromOutboundPolicy(error); }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 401 || response.status === 403) throw new NodeFailure("STEAM_ACCESS_DENIED", "Steam denied access. Check the API key and profile privacy settings.", false, response.status);
    throw new NodeFailure("HTTP_ERROR", `Steam returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
  }
  const payload = await readProviderJson(response, "Steam");
  // The API key is sent as a query parameter; never persist it if echoed back.
  if (JSON.stringify(payload).includes(key)) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Steam returned an unsafe response.", false);
  const result = parseSteamResult(operation, payload, selectedSteamId);
  return { status: "succeeded" as const, output: { operation, result }, route: "success" as const };
}
