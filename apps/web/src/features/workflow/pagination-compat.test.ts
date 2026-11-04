import assert from "node:assert/strict";
import test from "node:test";
import { createNodeData, getNodeDefinition, libraryNodeType, matchesNodeLibraryFilter, operationsForApp, upgradePaginationNode } from "./node-catalog";
import { graphForApi, graphFromApi } from "./workflow-api";

const types = [
  ["action.google-drive", "google-drive"], ["action.gmail.read", "gmail"],
  ["action.notion.search-pages", "notion"], ["action.sentry.list-issues", "sentry"],
  ["action.vercel.list-deployments", "vercel"],
] as const;

test("legacy favorites resolve to the current library entry without duplicating old nodes", () => {
  const legacyTypes = [
    "trigger.uptime-kuma.alert", "action.google-drive", "action.google-sheets", "action.google-chat.oauth",
    "action.gmail.read", "action.notion.search-pages", "action.sentry.list-issues", "action.vercel.list-deployments",
    "action.postgres.select", "action.supabase.select",
  ];
  for (const type of legacyTypes) {
    const old = getNodeDefinition(type);
    const current = getNodeDefinition(libraryNodeType(type));
    assert.ok(old?.hiddenFromLibrary, type);
    assert.ok(current?.available && !current.hiddenFromLibrary, type);
    assert.equal(current.appId, old.appId, type);
    assert.equal(current.operationId, old.operationId, type);
  }
  assert.equal(libraryNodeType("action.http-request"), "action.http-request");
  assert.equal(libraryNodeType("unknown-node"), "unknown-node");
});

test("historical graphs round trip unchanged and upgrade preserves every config field", () => {
  for (const [type, app] of types) {
    const config = { credentialId: "synthetic", cursor: "saved", pageToken: "saved-page", extra: { retained: true }, operation: "uploadText", text: "contents" };
    const graph = { nodes: [{ id: "step", type, position: { x: 0, y: 0 }, config }], edges: [] };
    const canvas = graphFromApi(graph);
    assert.deepEqual(graphForApi(canvas), graph);
    const old = canvas.nodes[0]!;
    const upgraded = upgradePaginationNode(old.data)!;
    assert.equal(upgraded.nodeType, `${type}.v2`);
    assert.deepEqual(upgraded.config, config);
    assert.equal(old.data.nodeType, type);
    const migrated = graphForApi({ ...canvas, nodes: [{ ...old, data: upgraded }] });
    assert.equal(migrated.nodes[0]?.type, `${type}.v2`);
    assert.deepEqual(migrated.nodes[0]?.config, config);
    assert.equal(upgradePaginationNode(upgraded), undefined);
    assert.equal(libraryNodeType(type), `${type}.v2`);
    assert.equal(matchesNodeLibraryFilter(getNodeDefinition(type)!, "all", app), false);
    assert.equal(operationsForApp(app).filter((item) => item.operationId === getNodeDefinition(type)!.operationId).length, 1);
    assert.equal(createNodeData(getNodeDefinition(`${type}.v2`)!).nodeVersion, 1);
  }
});
