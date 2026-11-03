import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkflowGraph, validatePublishableGraph } from "./workflow-graph";
import { systemWorkflowTemplates } from "./system-templates";
import { resolveExpressions } from "../execution/expression";
import { executeNode } from "../execution/execution.service";

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

test("connector-to-chat templates compose mock output into a bounded summary without credentials", async () => {
  const credentials = new Proxy({}, { get() { throw new Error("mock must not access credentials"); } }) as never;
  const summaries = systemWorkflowTemplates.filter((template) => template.slug.endsWith("-chat-summary"));
  const expected: Record<string, string> = {
    "inspect-postgres-rows-chat-summary": "PostgreSQL read completed. Rows returned: 1.",
    "inspect-supabase-rows-chat-summary": "Supabase read completed. Rows returned: 1.",
    "inspect-sheet-rows-chat-summary": "Spreadsheet read completed for range Sheet1!A1:C20.",
    "find-notion-pages-chat-summary": "Notion search completed. More pages available: false.",
    "inspect-trello-cards-chat-summary": "Trello read completed. Cards returned: 1.",
  };
  assert.equal(summaries.length, 5);
  for (const template of summaries) {
    const inspect = template.graph.nodes.find((node) => node.id === "inspect")!;
    const notify = template.graph.nodes.find((node) => node.id === "notify")!;
    const result = await executeNode(inspect, inspect.config, {}, "mock", "workspace", credentials, "execution");
    const config = resolveExpressions(notify.config, { steps: { inspect: { output: result.output } } }) as Record<string, unknown>;
    assert.equal(result.status, "succeeded", template.slug);
    assert.equal(config.message, expected[template.slug], template.slug);
    const base = systemWorkflowTemplates.find((item) => `${item.slug}-chat-summary` === template.slug)!;
    assert.notEqual(inspect.config, base.graph.nodes.find((node) => node.id === "inspect")!.config, template.slug);
    const notification = await executeNode(notify, config, {}, "mock", "workspace", credentials, "execution");
    assert.equal(notification.status, "succeeded", template.slug);
  }
});
