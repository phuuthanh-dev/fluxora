import assert from "node:assert/strict";
import test from "node:test";
import { steamSnapshot } from "./execution.service";

test("Steam snapshot returns profile, current/recent/owned games, and optional achievements", async () => {
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    requested.push(url);
    if (url.includes("GetPlayerSummaries")) return Response.json({ response: { players: [{ steamid: "7656", personaname: "Thanh", gameid: 620, gameextrainfo: "Portal 2" }] } });
    if (url.includes("GetOwnedGames")) return Response.json({ response: { game_count: 2, games: [{ appid: 620, name: "Portal 2", playtime_forever: 1240 }, { appid: 1145360, name: "Hades", playtime_forever: 680 }] } });
    if (url.includes("GetRecentlyPlayedGames")) return Response.json({ response: { games: [{ appid: 620, name: "Portal 2", playtime_2weeks: 180, playtime_forever: 1240 }] } });
    if (url.includes("GetPlayerAchievements")) return Response.json({ playerstats: { steamID: "7656", achievements: [{ apiname: "ACH_TEST", achieved: 1 }] } });
    throw new Error(`Unexpected Steam URL: ${url}`);
  }) as typeof fetch;
  try {
    const snapshot = await steamSnapshot({ apiKey: "test-key", steamId: "7656" }, { includeOwnedGames: true, includeRecentGames: true, achievementAppId: "620" });
    assert.equal((snapshot.currentGame as { name: string }).name, "Portal 2");
    assert.equal((snapshot.ownedGames as unknown[]).length, 2);
    assert.equal((snapshot.recentGames as unknown[]).length, 1);
    assert.deepEqual(snapshot.achievements, { steamID: "7656", achievements: [{ apiname: "ACH_TEST", achieved: 1 }] });
    assert.equal((snapshot.summary as { topGames: Array<{ name: string }> }).topGames[0]?.name, "Portal 2");
    assert.equal(requested.length, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
