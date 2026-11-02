import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkflowGraph, validatePublishableGraph } from "./workflow-graph";
import { systemWorkflowTemplates } from "./system-templates";

test("system workflow templates are valid executable graphs with declared connections", () => {
  assert.equal(new Set(systemWorkflowTemplates.map((template) => template.slug)).size, systemWorkflowTemplates.length);
  for (const template of systemWorkflowTemplates) {
    assert.ok(template.tags.length >= 1, `${template.slug} should declare at least one use-case tag`);
    assert.ok(template.requiredConnections.length >= 1, `${template.slug} should declare required connections`);
    assert.doesNotThrow(() => validatePublishableGraph(parseWorkflowGraph(template.graph)), template.slug);
    assert.equal(template.graph.nodes.filter((node) => node.type.startsWith("trigger.")).length, 1);
    assert.ok(template.graph.edges.length > 0, `${template.slug} should connect its nodes`);
  }
  for (const slug of ["inspect-postgres-rows", "inspect-supabase-rows", "inspect-sheet-rows", "find-notion-pages", "inspect-trello-cards"]) assert.ok(systemWorkflowTemplates.some((template) => template.slug === slug));
});
