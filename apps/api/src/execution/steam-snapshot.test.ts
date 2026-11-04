import assert from "node:assert/strict";
import test from "node:test";
import { steamSnapshot } from "./execution.service";
import { NodeFailure } from "./node-failure";
import { mockSteamSnapshot } from "./steam-adapter";
import { getOperationMetadata } from "@workflow/contracts";

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

test("legacy snapshot rejects an echoed API key before storing provider output", async () => {
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

test("legacy snapshot bounds provider payloads and does not expose transport errors", async () => {
  const credential = { apiKey: "synthetic-steam-api-key", steamId: "7656" };
  const config = { includeOwnedGames: false, includeRecentGames: false };
  const oversized = async () => new Response("{}", { headers: { "content-length": "5000001" } });
  await assert.rejects(steamSnapshot(credential, config, oversized), (error: unknown) => error instanceof NodeFailure && error.code === "RESPONSE_TOO_LARGE");
  const failing = async () => { throw new Error(`request contained ${credential.apiKey}`); };
  await assert.rejects(steamSnapshot(credential, config, failing), (error: unknown) => error instanceof NodeFailure && error.code === "NETWORK_ERROR" && !error.message.includes(credential.apiKey));
});

test("unavailable optional achievements still return null", async () => {
  const transport = async (url: string) => url.includes("GetPlayerAchievements") ? new Response(null, { status: 403 }) : Response.json({ response: { players: [{ steamid: "7656" }] } });
  const output = await steamSnapshot({ apiKey: "synthetic-key", steamId: "7656" }, { includeOwnedGames: false, includeRecentGames: false, achievementAppId: "620" }, transport);
  assert.equal(output.achievements, null);
});
