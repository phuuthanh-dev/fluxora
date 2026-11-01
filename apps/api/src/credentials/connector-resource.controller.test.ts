import assert from "node:assert/strict";
import test from "node:test";
import { ConnectorResourceController, supabaseDiscoveryError, trelloDiscoveryError } from "./connector-resource.controller";
import { NodeFailure } from "../execution/node-failure";

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
  for (const [status, code, expected] of [[401, "SUPABASE_TABLES_UNAVAILABLE", /API key/], [403, "SUPABASE_DISCOVERY_RESTRICTED", /denied schema discovery/], [429, "SUPABASE_TABLES_UNAVAILABLE", /rate limited/], [500, "SUPABASE_TABLES_UNAVAILABLE", /Check the connection/]] as const) {
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
  await assert.rejects(controller.sentryOrganizations("workspace", "sentry", request));
  await assert.rejects(controller.sentryProjects("workspace", "sentry", "organization", request));
  await assert.rejects(controller.vercelTeams("workspace", "vercel", request));
  await assert.rejects(controller.vercelProjects("workspace", "vercel", "team", request));
  await assert.rejects(controller.supabaseTables("workspace", "supabase", request));
  assert.equal(reads, 0);
});
