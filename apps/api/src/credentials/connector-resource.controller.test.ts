import assert from "node:assert/strict";
import test from "node:test";
import { ConnectorResourceController } from "./connector-resource.controller";

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
  assert.equal(reads, 0);
});
