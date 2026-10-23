import assert from "node:assert/strict";
import test from "node:test";
import { autoLayoutNodes } from "./auto-layout";
import { initialEdges, initialNodes, matchesNodeSearch, nodeCatalog } from "./node-catalog";

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
});
