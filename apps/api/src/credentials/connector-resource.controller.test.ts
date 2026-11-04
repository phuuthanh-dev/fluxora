import assert from "node:assert/strict";
import test from "node:test";
import { ConnectorResourceController, steamGameOptions, supabaseDiscoveryError, trelloDiscoveryError } from "./connector-resource.controller";
import { NodeFailure } from "../execution/node-failure";
import { CredentialProvider } from "@prisma/client";

test("Steam game discovery ignores invalid and duplicate IDs and bounds the list", () => {
  const games = Array.from({ length: 101 }, (_, index) => ({ appid: index + 1, name: `Game ${index + 1}` }));
  const result = steamGameOptions([...games, games[0], { appid: 0, name: "Invalid" }, { appid: 999, name: "" }]);
  assert.equal(result.games.length, 100);
  assert.deepEqual(result.games[0], { id: "1", name: "Game 1" });
  assert.equal(result.hasMore, true);
  assert.throws(() => steamGameOptions("not a list"));
});

test("Trello discovery guidance distinguishes permissions without leaking provider content", () => {
  for (const [status, expected] of [[401, /rejected/], [403, /permissions/], [429, /rate limited/]] as const) {
    const error = trelloDiscoveryError(new NodeFailure("HTTP_ERROR", "private provider response", false, status), "boards");
    const response = error.getResponse() as { code: string; message: string };
    assert.equal(response.code, "TRELLO_BOARDS_UNAVAILABLE");
    assert.match(response.message, expected);
    assert.ok(!response.message.includes("private provider response"));
  }
  assert.match((trelloDiscoveryError(new Error("secret provider text"), "lists").getResponse() as { message: string }).message, /Check your connection/);
});

test("Supabase discovery guidance is actionable and excludes provider messages", () => {
  const managed = supabaseDiscoveryError(new NodeFailure("SUPABASE_MANAGEMENT_AUTH_FAILED", "private response", false, 403)).getResponse() as { code: string; message: string };
  assert.equal(managed.code, "SUPABASE_TABLES_UNAVAILABLE");
  assert.match(managed.message, /management token/);
  assert.ok(!managed.message.includes("private response"));
  for (const [status, code, expected] of [[401, "SUPABASE_TABLES_UNAVAILABLE", /permitted row reads may still work.*manually.*Management token/], [403, "SUPABASE_DISCOVERY_RESTRICTED", /denied schema discovery/], [429, "SUPABASE_TABLES_UNAVAILABLE", /rate limited/], [500, "SUPABASE_TABLES_UNAVAILABLE", /Check the connection/]] as const) {
    const response = supabaseDiscoveryError(new NodeFailure("HTTP_ERROR", "private provider response", false, status)).getResponse() as { code: string; message: string };
    assert.equal(response.code, code);
    assert.match(response.message, expected);
    assert.ok(!response.message.includes("private provider response"));
  }
  const unknown = supabaseDiscoveryError(new Error("secret provider text")).getResponse() as { message: string };
  assert.match(unknown.message, /Check the connection/);
  assert.ok(!unknown.message.includes("secret provider text"));
});

test("connector discovery checks workspace ownership before credential access", async () => {
  let reads = 0;
  const credentials = { requireOwner: async () => { throw new Error("not owner"); }, readForExecution: async () => { reads++; }, readGoogleForExecution: async () => { reads++; } };
  const controller = new ConnectorResourceController(credentials as never);
  const request = { currentUser: { id: "other" } } as never;
  await assert.rejects(controller.mongoDatabases("workspace", "mongo", request));
  await assert.rejects(controller.mongoCollections("workspace", "mongo", "db", request));
  await assert.rejects(controller.chatSpaces("workspace", "chat", request));
  await assert.rejects(controller.postgresSchemas("workspace", "postgres", request));
  await assert.rejects(controller.postgresTables("workspace", "postgres", "public", request));
  await assert.rejects(controller.trelloBoards("workspace", "trello", request));
  await assert.rejects(controller.trelloLists("workspace", "trello", "board", request));
  await assert.rejects(controller.trelloCards("workspace", "trello", "board", request));
  await assert.rejects(controller.notionPages("workspace", "notion", "", undefined, request));
  await assert.rejects(controller.notionProperties("workspace", "notion", "page", request));
  await assert.rejects(controller.notionDataSources("workspace", "notion", undefined, request));
  await assert.rejects(controller.notionDataSourceProperties("workspace", "notion", "source", request));
  await assert.rejects(controller.notionDataSourceOptions("workspace", "notion", "source", "property", "status", request));
  await assert.rejects(controller.sentryOrganizations("workspace", "sentry", request));
  await assert.rejects(controller.sentryProjects("workspace", "sentry", "organization", request));
  await assert.rejects(controller.vercelTeams("workspace", "vercel", request));
  await assert.rejects(controller.vercelProjects("workspace", "vercel", "team", request));
  await assert.rejects(controller.supabaseTables("workspace", "supabase", request));
  await assert.rejects(controller.supabaseColumns("workspace", "supabase", "items", request));
  await assert.rejects(controller.postgresColumns("workspace", "postgres", "public", "items", request));
  assert.equal(reads, 0);
});

test("new discovery routes select the workspace credential and sanitize failures", async () => {
  const calls: unknown[][] = [];
  const credentials = {
    requireOwner: async (...args: unknown[]) => { calls.push(["owner", ...args]); },
    readForExecution: async (...args: unknown[]) => { calls.push(["read", ...args]); return { token: "fixture secret", apiKey: "fixture key" }; },
  };
  const controller = new ConnectorResourceController(credentials as never);
  const request = { currentUser: { id: "owner" } } as never;
  await assert.rejects(controller.steamGames("workspace", "steam", undefined, request));
  for (const [action, provider, code] of [
    [() => controller.steamGames("workspace", "connection", undefined, request), CredentialProvider.STEAM, "STEAM_GAMES_UNAVAILABLE"],
    [() => controller.trelloCards("workspace", "connection", "aaaaaaaaaaaaaaaaaaaaaaaa", request), CredentialProvider.TRELLO, "TRELLO_CARDS_UNAVAILABLE"],
    [() => controller.notionPages("workspace", "connection", "", undefined, request), CredentialProvider.NOTION, "NOTION_PAGES_UNAVAILABLE"],
    [() => controller.notionProperties("workspace", "connection", "invalid", request), CredentialProvider.NOTION, "NOTION_PROPERTIES_UNAVAILABLE"],
    [() => controller.notionDataSources("workspace", "connection", undefined, request), CredentialProvider.NOTION, "NOTION_DATA_SOURCES_UNAVAILABLE"],
    [() => controller.notionDataSourceProperties("workspace", "connection", "invalid", request), CredentialProvider.NOTION, "NOTION_DATA_SOURCE_PROPERTIES_UNAVAILABLE"],
    [() => controller.notionDataSourceOptions("workspace", "connection", "invalid", "invalid", "status", request), CredentialProvider.NOTION, "NOTION_DATA_SOURCE_OPTIONS_UNAVAILABLE"],
  ] as const) {
    calls.length = 0;
    await assert.rejects(action(), (error: unknown) => {
      const response = (error as { getResponse: () => { code: string; message: string } }).getResponse();
      assert.equal(response.code, code);
      assert.match(response.message, /manually/);
      assert.ok(!JSON.stringify(response).includes("fixture secret"));
      return true;
    });
    assert.deepEqual(calls, [["owner", "workspace", "owner"], ["read", "connection", "workspace", provider]]);
  }
});
