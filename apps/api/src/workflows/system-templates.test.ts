import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkflowGraph } from "./workflow-graph";
import { systemWorkflowTemplates } from "./system-templates";

test("system workflow templates are valid executable graphs with declared connections", () => {
  assert.equal(systemWorkflowTemplates.length, 3);
  for (const template of systemWorkflowTemplates) {
    assert.ok(template.requiredConnections.length >= 2, `${template.slug} should declare required connections`);
    assert.doesNotThrow(() => parseWorkflowGraph(template.graph), template.slug);
    assert.match(JSON.stringify(template.graph), /{{steps\.steam\.output\.summary\.totalGames}}/, template.slug);
  }
});
