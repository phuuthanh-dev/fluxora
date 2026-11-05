import assert from "node:assert/strict";
import test from "node:test";
import { getNodeDefinition, operationsForApp } from "./node-catalog";
import { graphForApi, graphFromApi } from "./workflow-api";

test("each current connector is listed once and round trips its configuration", () => {
  for (const [type, app] of [["action.google-drive", "google-drive"], ["action.gmail.read", "gmail"], ["action.notion.search-pages", "notion"], ["action.sentry.list-issues", "sentry"], ["action.vercel.list-deployments", "vercel"]] as const) {
    const definition = getNodeDefinition(type)!;
    assert.equal(operationsForApp(app).filter((item) => item.operationId === definition.operationId).length, 1);
    const graph = { nodes: [{ id: "read", type, position: { x: 0, y: 0 }, config: { credentialId: "synthetic", cursor: "page" } }], edges: [] };
    assert.deepEqual(graphForApi(graphFromApi(graph)), graph);
  }
});
