import assert from "node:assert/strict";
import test from "node:test";
import { autoLayoutNodes } from "./auto-layout";
import {
  groupNodeLibrary,
  initialEdges,
  initialNodes,
  matchesNodeLibraryFilter,
  matchesNodeSearch,
  nodeCatalog,
} from "./node-catalog";

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

test("node library groups apps by user-facing purpose", () => {
  const appGroups = groupNodeLibrary(nodeCatalog.filter((node) => matchesNodeLibraryFilter(node, "apps")));
  assert.deepEqual(appGroups.map((group) => group.id), ["communication", "google-workspace", "developer-data"]);
  assert.ok(appGroups.find((group) => group.id === "communication")?.nodes.some((node) => node.type === "action.telegram.message"));
});

test("search can discover a planned node without opening the roadmap filter", () => {
  const results = nodeCatalog.filter((node) => matchesNodeLibraryFilter(node, "all", "OpenAI"));
  assert.deepEqual(results.map((node) => node.type), ["action.openai"]);
});

test("provider nodes declare reusable inspector fields in the catalog", () => {
  const discord = nodeCatalog.find((node) => node.type === "action.discord.webhook");
  const http = nodeCatalog.find((node) => node.type === "action.http-request");
  const drive = nodeCatalog.find((node) => node.type === "action.google-drive");

  assert.deepEqual(discord?.configurationFields?.map((field) => field.key), ["credentialId", "content", "username", "avatarUrl", "embeds", "allowedMentions"]);
  assert.deepEqual(http?.configurationFields?.map((field) => field.key), ["credentialId", "method", "url", "body", "timeoutMs"]);
  assert.equal(http?.configurationFields?.find((field) => field.key === "credentialId")?.kind, "credential");
  assert.equal(drive?.configurationFields?.find((field) => field.key === "text")?.kind, "textarea");
});
