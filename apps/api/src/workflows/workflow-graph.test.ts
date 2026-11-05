import assert from "node:assert/strict";
import test from "node:test";
import type { WorkflowGraph } from "@workflow/contracts";
import { BadRequestException } from "@nestjs/common";
import { parseStoredWorkflowGraph, parseWorkflowGraph, validatePublishableGraph } from "./workflow-graph";

const validSwitchGraph: WorkflowGraph = {
  nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    { id: "switch", type: "condition.switch", position: { x: 200, y: 0 }, config: { value: "public", cases: [{ value: "public" }, { value: "private" }] } },
    { id: "public-action", type: "action.http-request", position: { x: 400, y: 0 }, config: { url: "https://example.test" } },
  ],
  edges: [
    { id: "manual-switch", source: "manual", target: "switch", kind: "success" },
    { id: "switch-public", source: "switch", target: "public-action", kind: "case", caseValue: "public" },
  ],
};

test("publishes a Switch graph only when case edges map to configured values", () => {
  assert.doesNotThrow(() => validatePublishableGraph(validSwitchGraph));
  const invalid = structuredClone(validSwitchGraph);
  invalid.edges[1]!.caseValue = "unknown";
  assert.throws(() => validatePublishableGraph(invalid), BadRequestException);
});

test("Steam snapshot draft is editable but publishing validates literals and defers expressions", () => {
  const graph = (config: Record<string, unknown>) => parseWorkflowGraph({ nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    { id: "steam", type: "action.steam.account-snapshot", position: { x: 1, y: 0 }, config },
  ], edges: [] });
  for (const config of [{}, { steamId: "76561198000000000", achievementAppId: "620", includeOwnedGames: false }, { includeOwnedGames: "{{ steps.manual.output.include }}" }, { achievementAppId: "{{ steps.manual.output.appId }}" }]) {
    assert.doesNotThrow(() => validatePublishableGraph(graph(config)));
  }
  for (const config of [{ steamId: 123 }, { achievementAppId: "not-an-id" }, { includeOwnedGames: "false" }, { includeRecentGames: null }]) {
    const parsed = graph(config);
    assert.throws(() => validatePublishableGraph(parsed), (error: unknown) => error instanceof BadRequestException && String(error.message).includes("Node steam:"));
  }
});

test("MongoDB draft can be incomplete but publish checks static values and permits expressions", () => {
  const graph = (config: Record<string, unknown>) => parseWorkflowGraph({ nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    { id: "mongo", type: "action.mongodb", position: { x: 1, y: 0 }, config },
  ], edges: [] });
  assert.doesNotThrow(() => validatePublishableGraph(graph({ database: "sample", collection: "items", filter: "{}" })));
  assert.doesNotThrow(() => validatePublishableGraph(graph({ database: "{{ steps.manual.output.database }}", collection: "items" })));
  assert.throws(() => validatePublishableGraph(graph({ database: "sample", collection: "items", filter: null })), BadRequestException);
  assert.throws(() => validatePublishableGraph(graph({ database: "sample" })), BadRequestException);
});

test("cron drafts and stored graphs remain readable, but publishing requires a valid schedule", () => {
  const graph = (config: Record<string, unknown>) => ({ nodes: [{ id: "cron", type: "trigger.cron", position: { x: 0, y: 0 }, config }], edges: [] });
  for (const config of [
    { expression: "0 9 * * *", timezone: "Asia/Ho_Chi_Minh" },
    { expression: "*/15 * * * *", timezone: "UTC" },
    { expression: "0 9 * * *" },
  ]) assert.doesNotThrow(() => validatePublishableGraph(parseWorkflowGraph(graph(config))));
  for (const config of [
    {}, { expression: "not a cron" }, { expression: "0 9 * * *", timezone: "Invalid/Timezone" },
    { expression: "0 9 * * *", timezone: "" },
  ]) {
    const draft = graph(config);
    assert.doesNotThrow(() => parseWorkflowGraph(draft));
    assert.doesNotThrow(() => parseStoredWorkflowGraph(draft));
    assert.throws(() => validatePublishableGraph(parseWorkflowGraph(draft)), (error: unknown) => error instanceof BadRequestException && String(error.message).includes("cron expression and timezone"));
  }
});

test("publish rejects unknown static condition and approval choices without changing stored graphs", () => {
  for (const [type, key, supported] of [
    ["condition.if", "operator", ["equals", "not_equals", "contains", "exists"]],
    ["approval.request", "notificationProvider", ["google_chat", "http_webhook"]],
  ] as const) {
    const graph = (value: unknown) => ({ nodes: [
      { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
      { id: "node", type, position: { x: 200, y: 0 }, config: value === undefined ? {} : { [key]: value } },
    ], edges: [] });
    for (const value of [undefined, null, "", ...supported]) {
      assert.doesNotThrow(() => validatePublishableGraph(parseWorkflowGraph(graph(value))), `${type}: ${String(value)}`);
    }
    const expression = "{{ steps.previous.output.choice }}";
    if (type === "condition.if") assert.doesNotThrow(() => validatePublishableGraph(parseWorkflowGraph(graph(expression))));
    else assert.throws(() => validatePublishableGraph(parseWorkflowGraph(graph(expression))), BadRequestException);
    for (const value of ["unsupported", 123, false]) {
      const saved = graph(value);
      assert.doesNotThrow(() => parseStoredWorkflowGraph(saved));
      assert.throws(() => validatePublishableGraph(parseWorkflowGraph(saved)), BadRequestException);
    }
  }
});

test("planned nodes remain readable in drafts but cannot be published", () => {
  for (const type of ["action.facebook-meta", "action.instagram"] as const) {
    const graph = structuredClone(validSwitchGraph);
    graph.nodes.push({ id: "planned", type, position: { x: 600, y: 0 }, config: {} });
    const parsed = parseWorkflowGraph(graph);
    assert.equal(parsed.nodes.at(-1)?.type, type);
    assert.throws(() => validatePublishableGraph(parsed), (error: unknown) => error instanceof BadRequestException && (error.getResponse() as { code?: string }).code === "NODE_UNAVAILABLE");
  }
});

test("RSS drafts allow incomplete URLs without DNS but reject identifiable secrets", () => {
  const graph = (url: string) => ({ nodes: [{ id: "rss", type: "trigger.rss.new-item", position: { x: 0, y: 0 }, config: { url, pollMinutes: "5" } }], edges: [] });
  assert.doesNotThrow(() => parseWorkflowGraph(graph("")));
  assert.throws(() => validatePublishableGraph(parseWorkflowGraph(graph(""))), BadRequestException);
  assert.doesNotThrow(() => validatePublishableGraph(parseWorkflowGraph(graph("https://feeds.example.test/path?lang=vi"))));
  assert.throws(() => parseWorkflowGraph(graph("https://feeds.example.test/path?token=private")), (error: unknown) => error instanceof BadRequestException && !String(error).includes("private"));
});
