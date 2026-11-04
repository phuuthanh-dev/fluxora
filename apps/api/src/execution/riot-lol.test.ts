import assert from "node:assert/strict";
import test from "node:test";
import { CredentialProvider } from "@prisma/client";
import { executeRiotLol, executeRiotTft } from "./riot-lol";
import { NodeFailure } from "./node-failure";

const key = "RGAPI-test-fixture-key";
const config = { credentialId: "riot-1", platform: "vn2", gameName: "Test Player", tagLine: "VN2", puuid: "fixture_puuid", matchId: "VN2_123", count: 10, start: 0 };
const credentials = { readForExecution: async (id: string, workspace: string, provider: CredentialProvider) => {
  assert.deepEqual([id, workspace, provider], ["riot-1", "workspace-1", CredentialProvider.RIOT]);
  return { apiKey: key };
}, guardRiotRequest: async (request: () => Promise<Response>) => request() } as never;
const cases = [
  ["accountByRiotId", "asia", "/riot/account/v1/accounts/by-riot-id/Test%20Player/VN2", {}],
  ["accountByPuuid", "asia", "/riot/account/v1/accounts/by-puuid/fixture_puuid", {}],
  ["summoner", "vn2", "/lol/summoner/v4/summoners/by-puuid/fixture_puuid", {}],
  ["currentGame", "vn2", "/lol/spectator/v5/active-games/by-summoner/fixture_puuid", {}],
  ["matchIds", "sea", "/lol/match/v5/matches/by-puuid/fixture_puuid/ids", []],
  ["match", "sea", "/lol/match/v5/matches/VN2_123", {}],
  ["timeline", "sea", "/lol/match/v5/matches/VN2_123/timeline", {}],
  ["ranked", "vn2", "/lol/league/v4/entries/by-puuid/fixture_puuid", []],
  ["masteries", "vn2", "/lol/champion-mastery/v4/champion-masteries/by-puuid/fixture_puuid", []],
  ["topMasteries", "vn2", "/lol/champion-mastery/v4/champion-masteries/by-puuid/fixture_puuid/top", []],
] as const;

test("production blocks live Riot calls before accessing credentials or the network while mock mode remains available", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    for (const execute of [executeRiotLol, executeRiotTft]) {
      const noCredential = { readForExecution: () => { throw new Error("credential was accessed"); } } as never;
      const noNetwork = async () => { throw new Error("network was accessed"); };
      await assert.rejects(() => execute(config, "live", "workspace-1", noCredential, noNetwork), (error: unknown) => error instanceof NodeFailure && error.code === "RIOT_PRODUCTION_UNAVAILABLE" && !error.retryable);
      assert.equal((await execute(config, "mock", "workspace-1", noCredential, noNetwork)).status, "succeeded");
    }
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test("League actions use the workspace key and correct Vietnam routing without leaking the key", async () => {
  for (const [operation, host, path, payload] of cases) {
    const result = await executeRiotLol({ ...config, operation }, "live", "workspace-1", credentials, async (url, init) => {
      const request = new URL(url);
      assert.equal(request.hostname, `${host}.api.riotgames.com`);
      assert.equal(request.pathname, path);
      assert.equal(JSON.stringify(init.headers).includes(key), true);
      assert.equal(url.includes(key), false);
      return Response.json(payload);
    });
    assert.equal(result.output.operation, operation);
    assert.equal(JSON.stringify(result).includes(key), false);
    await executeRiotLol({ ...config, operation }, "mock", "workspace-1", {} as never, async () => { throw new Error("network in mock"); });
  }
});

test("League handles idle players, access failure and Retry-After without exposing provider content", async () => {
  const inactive = await executeRiotLol({ ...config, operation: "currentGame" }, "live", "workspace-1", credentials, async () => new Response(null, { status: 404 }));
  assert.deepEqual(inactive.output.result, { active: false });
  for (const status of [401, 403, 429, 500]) await assert.rejects(() => executeRiotLol(config, "live", "workspace-1", credentials, async () => new Response(key, { status, headers: { "Retry-After": "120" } })), (reason: unknown) => {
    assert.ok(reason instanceof NodeFailure);
    assert.equal(reason.message.includes(key), false);
    if (status === 429) { assert.equal(reason.retryAfterMs, 120_000); assert.equal(reason.retryable, false); }
    return true;
  });
});

test("League rejects untrusted hosts, identifiers and malformed provider responses", async () => {
  for (const input of [{ ...config, platform: "evil.test" }, { ...config, operation: "match", matchId: "../private" }, { ...config, operation: "matchIds", count: 101 }]) await assert.rejects(() => executeRiotLol(input, "mock", "workspace-1", {} as never));
  await assert.rejects(() => executeRiotLol(config, "live", "workspace-1", credentials, async () => Response.json({ token: key })), (reason: unknown) => reason instanceof NodeFailure && reason.code === "INVALID_PROVIDER_RESPONSE" && !reason.message.includes(key));
});

test("match filters and dates are encoded and regional routing follows the selected server", async () => {
  await executeRiotLol({ ...config, operation: "matchIds", platform: "euw1", matchFilter: "queue:420", startTime: "2026-01-01T00:00:00Z", endTime: "2026-01-02T00:00:00Z" }, "live", "workspace-1", credentials, async (url) => {
    const request = new URL(url);
    assert.equal(request.hostname, "europe.api.riotgames.com");
    assert.equal(request.searchParams.get("queue"), "420");
    assert.equal(request.searchParams.get("type"), null);
    assert.equal(request.searchParams.get("startTime"), "1767225600");
    assert.equal(request.searchParams.get("endTime"), "1767312000");
    return Response.json([]);
  });
  await assert.rejects(() => executeRiotLol({ ...config, operation: "matchIds", startTime: "2026-01-02T00:00:00Z", endTime: "2026-01-01T00:00:00Z" }, "mock", "workspace-1", {} as never));
  await assert.rejects(() => executeRiotLol({ ...config, operation: "matchIds", startTime: "2026-01-01T00:00:00" }, "mock", "workspace-1", {} as never));
});

test("match timelines have a bounded larger response allowance without changing other actions", async () => {
  const payload = { data: "x".repeat(1_100_000) };
  const result = await executeRiotLol({ ...config, operation: "timeline" }, "live", "workspace-1", credentials, async () => Response.json(payload));
  assert.deepEqual(result.output.result, payload);
  await assert.rejects(() => executeRiotLol({ ...config, operation: "match" }, "live", "workspace-1", credentials, async () => Response.json(payload)), (reason: unknown) => reason instanceof NodeFailure && reason.code === "RESPONSE_TOO_LARGE");
  await assert.rejects(() => executeRiotLol({ ...config, operation: "timeline" }, "live", "workspace-1", credentials, async () => new Response("x".repeat(5_000_001))), (reason: unknown) => reason instanceof NodeFailure && reason.code === "RESPONSE_TOO_LARGE");
});

test("TFT post-game operations use the existing workspace key and game-specific routes", async () => {
  const fixtures = [
    ["accountByRiotId", "asia", "/riot/account/v1/accounts/by-riot-id/Test%20Player/VN2", {}],
    ["accountByPuuid", "asia", "/riot/account/v1/accounts/by-puuid/fixture_puuid", {}],
    ["matchIds", "asia", "/tft/match/v1/matches/by-puuid/fixture_puuid/ids", []],
    ["match", "asia", "/tft/match/v1/matches/VN2_123", {}],
    ["ranked", "vn2", "/tft/league/v1/by-puuid/fixture_puuid", []],
    ["status", "vn2", "/tft/status/v1/platform-data", {}],
  ] as const;
  for (const [operation, host, path, payload] of fixtures) {
    const result = await executeRiotTft({ ...config, operation }, "live", "workspace-1", credentials, async (url, init) => {
      const request = new URL(url);
      assert.equal(request.hostname, `${host}.api.riotgames.com`);
      assert.equal(request.pathname, path);
      assert.equal(JSON.stringify(init.headers).includes(key), true);
      assert.equal(url.includes(key), false);
      return Response.json(payload);
    });
    assert.equal(result.output.operation, operation);
    assert.equal(JSON.stringify(result).includes(key), false);
    await executeRiotTft({ ...config, operation }, "mock", "workspace-1", {} as never, async () => { throw new Error("network in mock"); });
  }
  for (const invalid of [{ ...config, operation: "currentGame" }, { ...config, operation: "matchIds", count: 101 }, { ...config, platform: "evil.test" }]) {
    await assert.rejects(() => executeRiotTft(invalid, "mock", "workspace-1", {} as never));
  }
  await assert.rejects(() => executeRiotTft({ ...config, operation: "ranked" }, "live", "workspace-1", credentials, async () => new Response(key, { status: 403 })), (reason: unknown) => reason instanceof NodeFailure && reason.code === "RIOT_ACCESS_DENIED" && !reason.message.includes(key));
});
