import assert from "node:assert/strict";
import test from "node:test";
import { autoLayoutNodes } from "./auto-layout";
import {
  appCatalog,
  coreNodeDefinitions,
  createNodeData,
  getLibraryDefinition,
  libraryDefinitionId,
  initialEdges,
  initialNodes,
  matchesNodeLibraryFilter,
  matchesNodeSearch,
  nodeCatalog,
  operationsForApp,
} from "./node-catalog";
import { graphForApi, graphFromApi } from "./workflow-api";

test("League operations are independently discoverable while sharing the Riot executor", () => {
  const actions = operationsForApp("riot-lol");
  assert.equal(actions.length, 10);
  assert.equal(new Set(actions.map(libraryDefinitionId)).size, 10);
  for (const definition of actions) {
    const node = { id: "riot", type: "workflowNode" as const, position: { x: 0, y: 0 }, data: createNodeData(definition) };
    const graph = graphForApi({ nodes: [node], edges: [] });
    assert.equal(graph.nodes[0]?.type, "action.riot-lol");
    assert.equal(graph.nodes[0]?.config.operation, definition.operationId);
    assert.equal(graphFromApi(graph).nodes[0]?.data.label, definition.label);
  }
});

test("TFT operations are discoverable and restricted Riot games remain unavailable", () => {
  const actions = operationsForApp("riot-tft");
  assert.equal(actions.length, 6);
  assert.equal(new Set(actions.map(libraryDefinitionId)).size, 6);
  for (const definition of actions) {
    const node = { id: "tft", type: "workflowNode" as const, position: { x: 0, y: 0 }, data: createNodeData(definition) };
    const graph = graphForApi({ nodes: [node], edges: [] });
    assert.equal(graph.nodes[0]?.type, "action.riot-tft");
    assert.equal(graph.nodes[0]?.config.operation, definition.operationId);
    assert.equal(graphFromApi(graph).nodes[0]?.data.label, definition.label);
  }
  for (const id of ["riot-valorant", "riot-lor", "riot-2xko"]) {
    const planned = operationsForApp(id);
    assert.equal(planned.length, 1);
    assert.equal(planned[0]?.available, false);
  }
});

test("Steam actions preserve distinct library identities and share the persisted executor", () => {
  const operations = operationsForApp("steam");
  assert.equal(operations.length, 8);
  const actions = operations.filter((node) => node.type === "action.steam");
  assert.deepEqual(actions.map((node) => node.defaultConfig.operation), ["profile", "friends", "badges", "resolveVanity", "ownedGames", "recentGames", "achievements"]);
  assert.equal(new Set(actions.map(libraryDefinitionId)).size, 7);
  assert.equal(getLibraryDefinition("action.steam")?.defaultConfig.operation, "profile");
  for (const definition of actions) {
    assert.equal(getLibraryDefinition(libraryDefinitionId(definition)), definition);
    const node = { id: "steam", type: "workflowNode" as const, position: { x: 0, y: 0 }, data: createNodeData(definition) };
    const saved = graphForApi({ nodes: [node], edges: [] });
    assert.equal(saved.nodes[0]?.type, "action.steam");
    assert.equal(saved.nodes[0]?.config.operation, definition.defaultConfig.operation);
    assert.equal(graphFromApi(saved).nodes[0]?.data.label, definition.label);
    assert.ok(matchesNodeSearch(definition, definition.operationLabel));
  }
});

test("auto-layout places downstream nodes in later columns", () => {
  const nodes = autoLayoutNodes(initialNodes, initialEdges);
  const trigger = nodes.find((node) => node.id === "schedule");
  const steam = nodes.find((node) => node.id === "steam");
  assert.ok(trigger && steam);
  assert.ok(steam.position.x > trigger.position.x);
});

test("node search matches node labels and types", () => {
  assert.ok(nodeCatalog.filter((node) => matchesNodeSearch(node, "steam")).some((node) => node.type === "action.steam.account-snapshot"));
  assert.ok(nodeCatalog.filter((node) => matchesNodeSearch(node, "google-sheets")).some((node) => node.type === "action.google-sheets"));
  assert.ok(nodeCatalog.filter((node) => matchesNodeSearch(node, "communication")).some((node) => node.type === "action.telegram.message"));
});

test("node library keeps roadmap nodes out of the default view", () => {
  const readyNodes = nodeCatalog.filter((node) => matchesNodeLibraryFilter(node, "all"));
  const roadmapNodes = nodeCatalog.filter((node) => matchesNodeLibraryFilter(node, "roadmap"));
  assert.ok(readyNodes.length > 0);
  assert.ok(readyNodes.every((node) => node.available));
  assert.ok(roadmapNodes.length > 0);
  assert.ok(roadmapNodes.every((node) => !node.available));
});

test("node library separates core nodes from app operations", () => {
  assert.ok(coreNodeDefinitions().every((node) => !node.appId));
  assert.ok(appCatalog.some((app) => app.id === "telegram" && app.category === "communication"));
  assert.deepEqual(operationsForApp("telegram").map((node) => node.operationId), ["receive-update", "send-message", "reply", "edit-message"]);
  assert.ok(nodeCatalog.filter((node) => matchesNodeLibraryFilter(node, "communication")).some((node) => node.type === "action.telegram.message"));
  assert.ok(nodeCatalog.filter((node) => matchesNodeLibraryFilter(node, "developer-devops")).some((node) => node.type === "action.http-request"));
});

test("search can discover a planned node without opening the roadmap filter", () => {
  const results = nodeCatalog.filter((node) => matchesNodeLibraryFilter(node, "all", "MongoDB"));
  assert.deepEqual(results.map((node) => node.type), ["action.mongodb", "action.mongodb.insert"]);
});

test("provider nodes declare reusable inspector fields in the catalog", () => {
  const discord = nodeCatalog.find((node) => node.type === "action.discord.webhook");
  const http = nodeCatalog.find((node) => node.type === "action.http-request");
  const drive = nodeCatalog.find((node) => node.type === "action.google-drive");

  assert.deepEqual(discord?.configurationFields?.map((field) => field.key), ["credentialId", "content", "username", "avatarUrl", "embeds", "allowedMentions"]);
  assert.deepEqual(http?.configurationFields?.map((field) => field.key), ["credentialId", "method", "url", "headers", "body", "timeoutMs"]);
  assert.equal(http?.configurationFields?.find((field) => field.key === "credentialId")?.kind, "credential");
  assert.equal(drive?.configurationFields?.find((field) => field.key === "text")?.kind, "textarea");
});

test("every catalog entry declares stable operation metadata and existing node types remain unchanged", () => {
  assert.ok(nodeCatalog.every((node) => node.operationId && node.operationLabel && node.operationKind));
  assert.ok(nodeCatalog.some((node) => node.type === "action.google-chat.webhook" && node.appId === "google-chat"));
  assert.ok(nodeCatalog.some((node) => node.type === "condition.if" && !node.appId));
});

test("each app has a unique identity and operations with valid discovery groups", () => {
  assert.equal(new Set(appCatalog.map((app) => app.id)).size, appCatalog.length);
  for (const app of appCatalog) {
    const operations = operationsForApp(app.id);
    assert.ok(operations.length > 0, `${app.id} has no discoverable operation`);
    assert.equal(new Set(operations.map((operation) => operation.operationId)).size, operations.length, `${app.id} repeats an operation id`);
    assert.ok(operations.every((operation) => ["trigger", "action", "search", "utility"].includes(operation.operationKind)));
  }
  assert.ok(nodeCatalog.every((node) => !node.appId || appCatalog.some((app) => app.id === node.appId)));
});
