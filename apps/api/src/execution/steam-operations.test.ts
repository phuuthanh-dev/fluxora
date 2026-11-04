import assert from "node:assert/strict";
import test from "node:test";
import { CredentialProvider } from "@prisma/client";
import { executeSteamOperation } from "./steam-operations";
import { NodeFailure } from "./node-failure";

const steamId = "76561198000000000";
const apiKey = "mock-credential-secret-123";
const calls: unknown[][] = [];
const credentials = { readForExecution: async (...args: unknown[]) => { calls.push(args); return { apiKey, steamId }; } } as never;
const cases = [
  { operation: "profile", path: "/ISteamUser/GetPlayerSummaries/v2/", field: "steamids", payload: { response: { players: [{ steamid: steamId, personaname: "Player" }] } }, result: { steamid: steamId, personaname: "Player" } },
  { operation: "friends", path: "/ISteamUser/GetFriendList/v1/", field: "steamid", payload: { friendslist: { friends: [] } }, result: { friends: [] } },
  { operation: "badges", path: "/IPlayerService/GetBadges/v1/", field: "steamid", payload: { response: { badges: [], player_level: 4 } }, result: { badges: [], player_level: 4 } },
  { operation: "resolveVanity", path: "/ISteamUser/ResolveVanityURL/v1/", field: "vanityurl", payload: { response: { success: 1, steamid: steamId } }, result: { success: 1, steamid: steamId } },
  { operation: "ownedGames", path: "/IPlayerService/GetOwnedGames/v1/", field: "steamid", payload: { response: { game_count: 0 } }, result: { game_count: 0 } },
  { operation: "recentGames", path: "/IPlayerService/GetRecentlyPlayedGames/v1/", field: "steamid", payload: { response: { total_count: 0 } }, result: { total_count: 0 } },
  { operation: "achievements", path: "/ISteamUserStats/GetPlayerAchievements/v1/", field: "steamid", payload: { playerstats: { success: true, achievements: [] } }, result: { success: true, achievements: [] } },
] as const;

test("all seven community Steam operations use their documented endpoints and workspace connection", async () => {
  calls.length = 0;
  for (const item of cases) {
    const config = { credentialId: "steam-connection", operation: item.operation, vanity: "https://steamcommunity.com/id/gamer/", appId: "620", language: "english" };
    let requested: URL | undefined;
    const response = await executeSteamOperation(config, "live", "workspace-1", credentials, async (url, init) => {
      requested = new URL(url);
      assert.equal(init.method, "GET");
      return Response.json(item.payload);
    });
    assert.equal(requested?.origin, "https://api.steampowered.com");
    assert.equal(requested?.pathname, item.path);
    assert.equal(requested?.searchParams.get(item.field), item.operation === "resolveVanity" ? "gamer" : steamId);
    assert.equal(requested?.searchParams.get("key"), apiKey);
    if (item.operation === "achievements") assert.equal(requested?.searchParams.get("appid"), "620");
    if (item.operation === "ownedGames") assert.equal(requested?.searchParams.has("include_played_free_games"), false);
    assert.deepEqual(response.output, { operation: item.operation, result: item.result });
    assert.equal(JSON.stringify(response).includes(apiKey), false);
  }
  assert.deepEqual(calls, cases.map(() => ["steam-connection", "workspace-1", CredentialProvider.STEAM]));
});

test("mock Steam operations never call the provider and preserve a configured profile ID", async () => {
  for (const item of cases) {
    const result = await executeSteamOperation({ operation: item.operation, steamId, vanity: "gamer", appId: "620" }, "mock", "workspace-1", {} as never, async () => { throw new Error("unexpected network"); });
    assert.equal(result.output.operation, item.operation);
    if (item.operation === "profile") assert.equal(result.output.result.steamid, steamId);
  }
});

test("owned games can explicitly include played free games", async () => {
  await executeSteamOperation({ credentialId: "steam-connection", operation: "ownedGames", includePlayedFreeGames: true }, "live", "workspace-1", credentials, async (url) => {
    assert.equal(new URL(url).searchParams.get("include_played_free_games"), "1");
    return Response.json({ response: { game_count: 0 } });
  });
});

test("Steam distinguishes private or missing data from an empty library and redacts provider errors", async () => {
  for (const operation of ["ownedGames", "recentGames", "badges"]) {
    await assert.rejects(() => executeSteamOperation({ credentialId: "steam-connection", operation }, "live", "workspace-1", credentials, async () => Response.json({ response: {} })), (error: unknown) => error instanceof NodeFailure && error.code === "STEAM_DATA_UNAVAILABLE" && !error.retryable);
  }
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(() => executeSteamOperation({ credentialId: "steam-connection", operation: "friends" }, "live", "workspace-1", credentials, async () => new Response(apiKey, { status })), (error: unknown) => error instanceof NodeFailure && error.code === (status < 429 ? "STEAM_ACCESS_DENIED" : "HTTP_ERROR") && error.retryable === (status >= 429) && !error.message.includes(apiKey));
  }
  await assert.rejects(() => executeSteamOperation({ credentialId: "steam-connection", operation: "achievements", appId: "620" }, "live", "workspace-1", credentials, async () => Response.json({ playerstats: { success: false, error: "private" } })), (error: unknown) => error instanceof NodeFailure && error.code === "STEAM_DATA_UNAVAILABLE");
  await assert.rejects(() => executeSteamOperation({ credentialId: "steam-connection", operation: "profile" }, "live", "workspace-1", credentials, async () => Response.json({ response: { players: [{ name: apiKey }] } })), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_PROVIDER_RESPONSE" && !error.message.includes(apiKey));
  await assert.rejects(() => executeSteamOperation({ credentialId: "steam-connection", operation: "profile" }, "live", "workspace-1", credentials, async () => Response.json({ response: { players: [{ steamid: "76561198000000001" }] } })), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_PROVIDER_RESPONSE");
  await assert.rejects(() => executeSteamOperation({ credentialId: "steam-connection", operation: "profile" }, "live", "workspace-1", credentials, async () => new Response("x".repeat(1_000_001))), (error: unknown) => error instanceof NodeFailure && error.code === "RESPONSE_TOO_LARGE");
  await assert.rejects(() => executeSteamOperation({ credentialId: "steam-connection", operation: "profile" }, "live", "workspace-1", credentials, async () => { throw new Error(`secret ${apiKey}`); }), (error: unknown) => error instanceof NodeFailure && error.code === "NETWORK_ERROR" && !error.message.includes(apiKey));
});

test("Steam validates operation, ID, App ID and profile URL before making requests", async () => {
  const invalid = [
    { operation: "missing" }, { operation: "profile", steamId: "-1" },
    { operation: "ownedGames", includePlayedFreeGames: "true" },
    { operation: "achievements", appId: "4294967296" }, { operation: "achievements", appId: "620", language: "en us" },
    { operation: "resolveVanity", vanity: "https://attacker.example/id/name" },
    { operation: "resolveVanity", vanity: "https://steamcommunity.com/id/name?secret=1" },
  ];
  for (const config of invalid) await assert.rejects(() => executeSteamOperation(config, "mock", "workspace-1", {} as never), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT");
});
