import { CredentialProvider } from "@prisma/client";
import { riotLolActions, riotLolPlatforms, riotTftActions, type RiotLolOperation, type RiotTftOperation } from "@workflow/contracts";
import type { CredentialService } from "../credentials/credential.service";
import { readCredentialId, readCredentialValue } from "./connector-config";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { readProviderJson } from "./provider-request-policy";
import { parseRetryAfter } from "./retry-policy";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
const platforms = new Set<string>(riotLolPlatforms.map(([id]) => id));
const americas = new Set(["na1", "br1", "la1", "la2"]);
const europe = new Set(["euw1", "eun1", "tr1", "ru"]);
const asia = new Set(["kr", "jp1"]);
function region(platform: string, account: boolean) {
  if (americas.has(platform)) return "americas";
  if (europe.has(platform)) return "europe";
  if (asia.has(platform)) return "asia";
  return account ? "asia" : "sea";
}
function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new NodeFailure("INVALID_INPUT", `Enter a valid ${label}.`, false);
  return value.trim();
}
function identifier(value: unknown, label: string): string {
  const input = text(value, label, 100);
  if (!/^[A-Za-z0-9_-]+$/.test(input)) throw new NodeFailure("INVALID_INPUT", `Enter a valid ${label}.`, false);
  return input;
}
function integer(value: unknown, fallback: number, min: number, max: number, label: string): number {
  const parsed = value === undefined || value === "" ? fallback : typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new NodeFailure("INVALID_INPUT", `${label} must be between ${min} and ${max}.`, false);
  return parsed;
}

function prepare(config: Record<string, unknown>, game: "lol" | "tft") {
  const operation = config.operation ?? "accountByRiotId";
  const actions = game === "lol" ? riotLolActions : riotTftActions;
  if (typeof operation !== "string" || !actions.some((item) => item.id === operation)) throw new NodeFailure("INVALID_INPUT", "Choose a supported Riot game operation.", false);
  const op = operation as RiotLolOperation | RiotTftOperation;
  const platform = config.platform ?? "vn2";
  if (typeof platform !== "string" || !platforms.has(platform)) throw new NodeFailure("INVALID_INPUT", "Choose a valid League server.", false);
  let host = platform;
  let path: string;
  const params = new URLSearchParams();
  if (op === "accountByRiotId") {
    host = region(platform, true);
    const gameName = text(config.gameName, "Riot ID game name", 100);
    const tag = text(config.tagLine, "Riot ID tag", 20).replace(/^#/, "");
    if (!tag || /[\/\\?#]/.test(tag) || /[\/\\?#]/.test(gameName)) throw new NodeFailure("INVALID_INPUT", "Enter a valid Riot ID and tag.", false);
    path = `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tag)}`;
  } else if (op === "status") {
    path = "/tft/status/v1/platform-data";
  } else if (op === "match" || op === "timeline") {
    host = region(platform, game === "tft");
    const id = identifier(config.matchId, "match ID");
    path = game === "tft" ? `/tft/match/v1/matches/${id}` : `/lol/match/v5/matches/${id}${op === "timeline" ? "/timeline" : ""}`;
  } else {
    const id = identifier(config.puuid, "player PUUID");
    switch (op) {
      case "accountByPuuid": host = region(platform, true); path = `/riot/account/v1/accounts/by-puuid/${id}`; break;
      case "summoner": path = `/lol/summoner/v4/summoners/by-puuid/${id}`; break;
      case "currentGame": path = `/lol/spectator/v5/active-games/by-summoner/${id}`; break;
      case "ranked": path = game === "tft" ? `/tft/league/v1/by-puuid/${id}` : `/lol/league/v4/entries/by-puuid/${id}`; break;
      case "masteries": path = `/lol/champion-mastery/v4/champion-masteries/by-puuid/${id}`; break;
      case "topMasteries": path = `/lol/champion-mastery/v4/champion-masteries/by-puuid/${id}/top`; params.set("count", String(integer(config.count, 20, 1, 100, "Count"))); break;
      case "matchIds": {
        host = region(platform, game === "tft"); path = game === "tft" ? `/tft/match/v1/matches/by-puuid/${id}/ids` : `/lol/match/v5/matches/by-puuid/${id}/ids`;
        params.set("start", String(integer(config.start, 0, 0, 1000, "Start"))); params.set("count", String(integer(config.count, 20, 1, 100, "Count")));
        if (game === "tft") break;
        const filter = config.matchFilter ?? "all";
        if (typeof filter !== "string" || !["all", "ranked", "normal", "tourney", "tutorial", "queue:420", "queue:440", "queue:400", "queue:450"].includes(filter)) throw new NodeFailure("INVALID_INPUT", "Choose a valid match filter.", false);
        if (filter.startsWith("queue:")) params.set("queue", filter.slice(6));
        else if (filter !== "all") params.set("type", filter);
        let previous: number | undefined;
        for (const field of ["startTime", "endTime"] as const) {
          const value = config[field];
          if (value === undefined || value === "") continue;
          if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new NodeFailure("INVALID_INPUT", "Enter a match date with a timezone.", false);
          const time = Date.parse(value);
          if (!Number.isFinite(time) || time < 0) throw new NodeFailure("INVALID_INPUT", "Enter a valid match date.", false);
          if (field === "endTime" && previous !== undefined && time < previous) throw new NodeFailure("INVALID_INPUT", "End date must be after start date.", false);
          params.set(field, String(Math.floor(time / 1000))); previous = time;
        }
        break;
      }
    }
  }
  return { operation: op, url: `https://${host}.api.riotgames.com${path}${params.size ? `?${params}` : ""}` };
}

async function executeRiotGame(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, game: "lol" | "tft", transport: Transport = fetchSafeOutbound) {
  const { operation, url } = prepare(config, game);
  if (mode === "mock") return { status: "succeeded" as const, output: { operation, result: operation === "currentGame" ? { active: false } : operation === "matchIds" || operation === "ranked" || operation === "masteries" || operation === "topMasteries" ? [] : { sample: true } }, route: "success" as const };
  // Public availability requires Riot's decision on this workflow use case.
  if (process.env.NODE_ENV === "production") throw new NodeFailure("RIOT_PRODUCTION_UNAVAILABLE", "Riot live execution is unavailable on production while provider approval is pending.", false);
  const credential = await credentials.readForExecution(readCredentialId(config), workspaceId, CredentialProvider.RIOT);
  const key = readCredentialValue(credential, "apiKey");
  if (!/^RGAPI-[A-Za-z0-9-]{1,128}$/.test(key)) throw new NodeFailure("CREDENTIAL_INVALID", "Riot connection requires a valid API key.", false);
  let response: Response;
  try {
    response = await credentials.guardRiotRequest(async () => {
      try { return await transport(url, { method: "GET", headers: { "X-Riot-Token": key }, signal: AbortSignal.timeout(15_000) }); }
      catch (error) { throw nodeFailureFromOutboundPolicy(error); }
    });
  } catch (error) {
    if (error instanceof NodeFailure) throw error;
    throw new NodeFailure("RIOT_GUARD_UNAVAILABLE", "Riot rate-limit protection is unavailable. Try again after checking the server.", false);
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 404 && operation === "currentGame") return { status: "succeeded" as const, output: { operation, result: { active: false } }, route: "success" as const };
    if (response.status === 429) {
      const delay = parseRetryAfter(response.headers.get("retry-after"));
      const seconds = delay !== undefined && Number.isFinite(delay) ? Math.ceil(delay / 1000) : undefined;
      throw new NodeFailure("RIOT_RATE_LIMITED", seconds === undefined ? "Riot rate limited this request. Stop calls and check the provider's Retry-After guidance." : `Riot rate limited this request. Stop calls for at least ${seconds} seconds.`, false, 429, delay);
    }
    if (response.status === 401 || response.status === 403) throw new NodeFailure("RIOT_ACCESS_DENIED", "Riot denied access. Check your key, its expiry and product permissions.", false, response.status);
    throw new NodeFailure("RIOT_HTTP_ERROR", `Riot returned ${response.status}.`, response.status >= 500, response.status);
  }
  // Match timelines commonly exceed the standard 1 MB provider response cap.
  // Keep a separate bounded limit rather than increasing it for every connector.
  const result = await readProviderJson(response, "Riot", false, operation === "timeline" ? 5_000_000 : undefined);
  if (JSON.stringify(result).includes(key)) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Riot returned an unsafe response.", false);
  const expectsArray = ["matchIds", "ranked", "masteries", "topMasteries"].includes(operation);
  if (expectsArray ? !Array.isArray(result) : !result || typeof result !== "object" || Array.isArray(result)) throw new NodeFailure("INVALID_PROVIDER_RESPONSE", "Riot returned an unexpected response.", false);
  return { status: "succeeded" as const, output: { operation, result: operation === "currentGame" ? { active: true, data: result } : result }, route: "success" as const };
}

export function executeRiotLol(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutbound) {
  return executeRiotGame(config, mode, workspaceId, credentials, "lol", transport);
}

export function executeRiotTft(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, transport: Transport = fetchSafeOutbound) {
  return executeRiotGame(config, mode, workspaceId, credentials, "tft", transport);
}
