import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("code graph includes directory imports resolved to index files", () => {
  const graph = JSON.parse(readFileSync(new URL("../docs/11-code-graph.json", import.meta.url), "utf8"));
  const imports = graph.nodes.find((node) => node.id === "apps/api/src/execution/execution.service.ts")?.internalImports;
  assert.ok(imports?.includes("apps/api/src/notifications/index.ts"));
});
