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

test("data starter templates require an explicit table or board before execution", async () => {
  const credentials = new Proxy({}, { get() { throw new Error("incomplete templates must not access credentials"); } }) as never;
  for (const [slug, key] of [["inspect-postgres-rows", "table"], ["inspect-supabase-rows", "table"], ["inspect-trello-cards", "boardId"]] as const) {
    for (const suffix of ["", "-chat-summary"]) {
      const template = systemWorkflowTemplates.find((item) => item.slug === slug + suffix)!;
      const node = template.graph.nodes.find((item) => item.id === "inspect")!;
      assert.equal(node.config[key], "", template.slug);
      for (const mode of ["mock", "live"] as const) {
        await assert.rejects(executeNode(node, node.config, {}, mode, "workspace", credentials, "execution"), { code: "INVALID_INPUT" }, template.slug);
      }
    }
  }
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
    const fixture = inspect.type === "action.postgres.select" || inspect.type === "action.supabase.select"
      ? { table: "fixture_table" }
      : inspect.type === "action.trello.list-cards" ? { boardId: "aaaaaaaaaaaaaaaaaaaaaaaa" } : {};
    const result = await executeNode(inspect, { ...inspect.config, ...fixture }, {}, "mock", "workspace", credentials, "execution");
    const config = resolveExpressions(notify.config, { steps: { inspect: { output: result.output } } }) as Record<string, unknown>;
    assert.equal(result.status, "succeeded", template.slug);
    assert.equal(config.message, expected[template.slug], template.slug);
    const base = systemWorkflowTemplates.find((item) => `${item.slug}-chat-summary` === template.slug)!;
    assert.notEqual(inspect.config, base.graph.nodes.find((node) => node.id === "inspect")!.config, template.slug);
    const notification = await executeNode(notify, config, {}, "mock", "workspace", credentials, "execution");
    assert.equal(notification.status, "succeeded", template.slug);
  }
});

test("Steam to Telegram template treats a dynamic player name as plain text", () => {
  const telegram = systemWorkflowTemplates.find((template) => template.slug === "steam-telegram-daily-report")!.graph.nodes.find((node) => node.id === "telegram")!;
  const config = resolveExpressions(telegram.config, { steps: { steam: { output: { profile: { personaname: "Player_[demo]" }, summary: { totalGames: 7 } } } } }) as Record<string, unknown>;
  assert.equal(config.parseMode, "");
  assert.equal(config.text, "Steam daily report for Player_[demo]: 7 games.");
});

test("AI structured summary templates need a chosen model and compose mock output without credentials", async () => {
  const credentials = new Proxy({}, { get() { throw new Error("mock must not access credentials"); } }) as never;
  for (const slug of ["ai-structured-gemini-to-chat", "ai-structured-openai-to-chat"]) {
    const template = systemWorkflowTemplates.find((item) => item.slug === slug)!;
    const summarize = template.graph.nodes.find((item) => item.id === "summarize")!;
    const notify = template.graph.nodes.find((item) => item.id === "notify")!;
    assert.equal(summarize.config.model, "");
    await assert.rejects(executeNode(summarize, summarize.config, {}, "mock", "workspace", credentials, "execution"), { code: "INVALID_INPUT" });
    const output = await executeNode(summarize, { ...summarize.config, model: "example-model" }, {}, "mock", "workspace", credentials, "execution");
    const notification = resolveExpressions(notify.config, { steps: { summarize: { output: output.output } } }) as Record<string, unknown>;
    assert.equal(notification.message, "AI summary: \nPriority: normal");
    assert.equal((await executeNode(notify, notification, {}, "mock", "workspace", credentials, "execution")).status, "succeeded");
  }
});
