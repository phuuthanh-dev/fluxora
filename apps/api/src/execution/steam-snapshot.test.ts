import assert from "node:assert/strict";
import test from "node:test";
import { steamSnapshot } from "./execution.service";
import { NodeFailure } from "./node-failure";
import { mockSteamSnapshot } from "./steam-adapter";
import { getOperationMetadata } from "@workflow/contracts";
import { getConnectorExecutor } from "./connector-executors";
import { resolveExpressions } from "./expression";

test("Steam snapshot returns profile, current/recent/owned games, and optional achievements", async () => {
  const requested: string[] = [];
  const transport = async (url: string) => {
    requested.push(url);
    if (url.includes("GetPlayerSummaries")) return Response.json({ response: { players: [{ steamid: "7656", personaname: "Thanh", gameid: "620", gameextrainfo: "Portal 2" }] } });
    if (url.includes("GetOwnedGames")) return Response.json({ response: { game_count: 2, games: [{ appid: 620, name: "Portal 2", playtime_forever: 1240 }, { appid: 1145360, name: "Hades", playtime_forever: 680 }] } });
    if (url.includes("GetRecentlyPlayedGames")) return Response.json({ response: { games: [{ appid: 620, name: "Portal 2", playtime_2weeks: 180, playtime_forever: 1240 }] } });
    if (url.includes("GetPlayerAchievements")) return Response.json({ playerstats: { steamID: "7656", achievements: [{ apiname: "ACH_TEST", achieved: 1 }] } });
    throw new Error(`Unexpected Steam URL: ${url}`);
  };
  const snapshot = await steamSnapshot({ apiKey: "test-key", steamId: "7656" }, { includeOwnedGames: true, includeRecentGames: true, achievementAppId: "620" }, transport);
  assert.equal((snapshot.profile as { steamid: string }).steamid, mockSteamSnapshot("7656").profile.steamid);
  assert.equal((snapshot.currentGame as { name: string }).name, "Portal 2");
  assert.equal(snapshot.currentGame?.appId, 620);
  assert.equal((snapshot.ownedGames as unknown[]).length, 2);
  assert.equal((snapshot.recentGames as unknown[]).length, 1);
  assert.deepEqual(snapshot.achievements, { steamID: "7656", achievements: [{ apiname: "ACH_TEST", achieved: 1 }] });
  assert.equal((snapshot.summary as { topGames: Array<{ name: string }> }).topGames[0]?.name, "Portal 2");
  assert.equal(requested.length, 4);
  const metadata = getOperationMetadata("action.steam.account-snapshot");
  assert.ok(metadata && "knownFields" in metadata.output);
  for (const field of metadata.output.knownFields) {
    assert.ok(Object.hasOwn(snapshot, field), `live fixture is missing ${field}`);
    assert.ok(Object.hasOwn(mockSteamSnapshot("7656"), field), `mock is missing ${field}`);
  }
});

test("Steam current game accepts numeric IDs and ignores malformed or missing IDs", async () => {
  for (const [gameid, expected] of [[620, 620], ["bad-id", null], [undefined, null], ["9007199254740992", null]] as const) {
    const transport = async () => Response.json({ response: { players: [{ steamid: "7656", gameid, gameextrainfo: "Portal 2" }] } });
    const snapshot = await steamSnapshot({ apiKey: "test-key", steamId: "7656" }, { includeOwnedGames: false, includeRecentGames: false }, transport);
    assert.equal(snapshot.currentGame?.appId ?? null, expected);
  }
});

test("Steam snapshot mock respects game options and returns internally consistent sample data", async () => {
  const execute = getConnectorExecutor("action.steam.account-snapshot")!;
  const credentials = { readForExecution: () => { throw new Error("unexpected credential read"); } } as never;
  const run = (config: Record<string, unknown>) => execute({ config, mode: "mock", workspaceId: "workspace", credentials, executionId: "execution", nodeId: "steam" });
  const skipped = await run({ includeOwnedGames: false, includeRecentGames: false });
  assert.deepEqual(skipped.output.ownedGames, []);
  assert.deepEqual(skipped.output.recentGames, []);
  assert.deepEqual(skipped.output.summary, { totalGames: 0, topGames: [] });
  assert.equal(skipped.output.achievements, null);
  const included = await run({ steamId: "7656", achievementAppId: "620" });
  const games = included.output.ownedGames as unknown[];
  assert.equal((included.output.summary as { totalGames: number }).totalGames, games.length);
  assert.deepEqual(included.output.achievements, { steamID: "7656", achievements: [{ apiname: "EXAMPLE_ACHIEVEMENT", achieved: 1 }] });
});

test("Steam snapshot rejects non-boolean or unresolved game options before provider requests", async () => {
  let requests = 0;
  const transport = async () => { requests++; throw new Error("unexpected provider request"); };
  const credential = { apiKey: "synthetic-key", steamId: "7656" };
  for (const key of ["includeOwnedGames", "includeRecentGames"]) {
    const unresolved = resolveExpressions({ [key]: "{{ steps.missing.output }}" }, { steps: {} }) as Record<string, unknown>;
    for (const config of [{ [key]: "false" }, { [key]: 0 }, { [key]: null }, unresolved]) {
      const invalid = (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT" && error.retryable === false;
      assert.throws(() => mockSteamSnapshot("7656", config), invalid);
      await assert.rejects(steamSnapshot(credential, config, transport), invalid);
    }
  }
  assert.equal(requests, 0);
});

test("Steam snapshot validates optional achievement App ID in mock and live modes", async () => {
  let requests = 0;
  const transport = async () => { requests++; throw new Error("unexpected provider request"); };
  const credential = { apiKey: "synthetic-key", steamId: "7656" };
  const unresolved = resolveExpressions({ achievementAppId: "{{ steps.missing.output }}" }, { steps: {} }) as Record<string, unknown>;
  for (const config of [{ achievementAppId: "not-an-app-id" }, { achievementAppId: "0" }, { achievementAppId: "4294967296" }, { achievementAppId: 620 }, { achievementAppId: null }, unresolved]) {
    const invalid = (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT" && error.retryable === false;
    assert.throws(() => mockSteamSnapshot("7656", config), invalid);
    await assert.rejects(steamSnapshot(credential, config, transport), invalid);
  }
  assert.equal(mockSteamSnapshot("7656", { achievementAppId: " 620 " }).achievements?.steamID, "7656");
  assert.equal(mockSteamSnapshot("7656", { achievementAppId: "" }).achievements, null);
  assert.equal(requests, 0);
});

test("Steam snapshot rejects invalid IDs before provider access in mock and live modes", async () => {
  const execute = getConnectorExecutor("action.steam.account-snapshot")!;
  const credentials = { readForExecution: () => { throw new Error("unexpected credential read"); } } as never;
  for (const steamId of ["abc", "-1", "0", "18446744073709551616", 123, null, undefined]) {
    for (const mode of ["mock", "live"] as const) {
      await assert.rejects(execute({ config: { steamId }, mode, workspaceId: "workspace", credentials, executionId: "execution", nodeId: "steam" }), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT" && !error.retryable);
    }
  }
  const mock = await execute({ config: { steamId: " 76561198000000000 " }, mode: "mock", workspaceId: "workspace", credentials, executionId: "execution", nodeId: "steam" });
  assert.equal((mock.output.profile as { steamid: string }).steamid, "76561198000000000");
  await assert.rejects(steamSnapshot({ apiKey: "synthetic-key", steamId: "invalid" }, {}, async () => { throw new Error("unexpected provider call"); }), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT");
});

test("Steam snapshot rejects an echoed API key before storing provider output", async () => {
  const key = "synthetic-steam-api-key";
  for (const target of ["GetPlayerSummaries", "GetOwnedGames", "GetRecentlyPlayedGames", "GetPlayerAchievements"]) {
    const transport = async (url: string) => {
      if (url.includes(target)) return Response.json({ echoed: key });
      if (url.includes("GetPlayerSummaries")) return Response.json({ response: { players: [{ steamid: "7656" }] } });
      return Response.json({ response: { games: [] } });
    };
    await assert.rejects(steamSnapshot({ apiKey: key, steamId: "7656" }, { achievementAppId: "620" }, transport), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_PROVIDER_RESPONSE" && !error.message.includes(key));
  }
});

test("Steam snapshot rejects unavailable or invalid account data instead of reporting an empty library", async () => {
  const credential = { apiKey: "synthetic-key", steamId: "7656" };
  const profile = { response: { players: [{ steamid: "7656" }] } };
  const otherProfile = async () => Response.json({ response: { players: [{ steamid: "1234" }] } });
  await assert.rejects(steamSnapshot(credential, { includeOwnedGames: false, includeRecentGames: false }, otherProfile), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_PROVIDER_RESPONSE");
  for (const unavailable of ["GetOwnedGames", "GetRecentlyPlayedGames"]) {
    const transport = async (url: string) => {
      if (url.includes("GetPlayerSummaries")) return Response.json(profile);
      if (url.includes(unavailable)) return Response.json({ response: {} });
      return Response.json({ response: { game_count: 0 } });
    };
    await assert.rejects(steamSnapshot(credential, { includeOwnedGames: true, includeRecentGames: true }, transport), (error: unknown) => error instanceof NodeFailure && error.code === "STEAM_DATA_UNAVAILABLE");
  }
  const empty = async (url: string) => url.includes("GetPlayerSummaries") ? Response.json(profile) : Response.json({ response: url.includes("GetOwnedGames") ? { game_count: 0 } : { total_count: 0 } });
  const result = await steamSnapshot(credential, {}, empty);
  assert.deepEqual(result.summary, { totalGames: 0, topGames: [] });
});

test("Steam snapshot bounds provider payloads and does not expose transport errors", async () => {
  const credential = { apiKey: "synthetic-steam-api-key", steamId: "7656" };
  const config = { includeOwnedGames: false, includeRecentGames: false };
  const oversized = async () => new Response("{}", { headers: { "content-length": "5000001" } });
  await assert.rejects(steamSnapshot(credential, config, oversized), (error: unknown) => error instanceof NodeFailure && error.code === "RESPONSE_TOO_LARGE");
  const failing = async () => { throw new Error(`request contained ${credential.apiKey}`); };
  await assert.rejects(steamSnapshot(credential, config, failing), (error: unknown) => error instanceof NodeFailure && error.code === "NETWORK_ERROR" && !error.message.includes(credential.apiKey));
});

test("Steam snapshot explains denied access without exposing the API key", async () => {
  const credential = { apiKey: "synthetic-steam-api-key", steamId: "7656" };
  for (const target of ["GetPlayerSummaries", "GetOwnedGames", "GetRecentlyPlayedGames"]) {
    for (const status of [401, 403]) {
      const transport = async (url: string) => {
        if (url.includes(target)) return new Response(credential.apiKey, { status });
        if (url.includes("GetPlayerSummaries")) return Response.json({ response: { players: [{ steamid: "7656" }] } });
        return Response.json({ response: { game_count: 0 } });
      };
      await assert.rejects(steamSnapshot(credential, {}, transport), (error: unknown) => error instanceof NodeFailure && error.code === "STEAM_ACCESS_DENIED" && !error.retryable && error.message.includes("privacy") && !error.message.includes(credential.apiKey));
    }
  }
});

test("unavailable optional achievements still return null", async () => {
  const transport = async (url: string) => url.includes("GetPlayerAchievements") ? new Response(null, { status: 403 }) : Response.json({ response: { players: [{ steamid: "7656" }] } });
  const output = await steamSnapshot({ apiKey: "synthetic-key", steamId: "7656" }, { includeOwnedGames: false, includeRecentGames: false, achievementAppId: "620" }, transport);
  assert.equal(output.achievements, null);
});
