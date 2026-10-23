import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkflowGraph } from "./workflow-graph";
import { systemWorkflowTemplates } from "./system-templates";

test("Steam daily report template is a valid executable graph", () => {
  const template = systemWorkflowTemplates.find((candidate) => candidate.slug === "steam-daily-report");
  assert.ok(template);
  assert.doesNotThrow(() => parseWorkflowGraph(template.graph));
  assert.match(String(template.graph.nodes[2]?.config.message), /{{steps\.steam-account\.output\.summary\.totalGames}}/);
});
