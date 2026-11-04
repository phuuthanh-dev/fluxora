import assert from "node:assert/strict";
import test from "node:test";
import type { WorkflowGraph } from "@workflow/contracts";
import { BadRequestException } from "@nestjs/common";
import { parseWorkflowGraph, validatePublishableGraph } from "./workflow-graph";

const validSwitchGraph: WorkflowGraph = {
  nodes: [
    { id: "manual", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} },
    { id: "switch", type: "condition.switch", position: { x: 200, y: 0 }, config: { value: "public", cases: [{ value: "public" }, { value: "private" }] } },
    { id: "public-action", type: "action.http-request", position: { x: 400, y: 0 }, config: {} },
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

test("planned nodes remain readable in drafts but cannot be published", () => {
  for (const type of ["action.facebook-meta", "action.instagram"] as const) {
    const graph = structuredClone(validSwitchGraph);
    graph.nodes.push({ id: "planned", type, position: { x: 600, y: 0 }, config: {} });
    const parsed = parseWorkflowGraph(graph);
    assert.equal(parsed.nodes.at(-1)?.type, type);
    assert.throws(() => validatePublishableGraph(parsed), (error: unknown) => error instanceof BadRequestException && (error.getResponse() as { code?: string }).code === "NODE_UNAVAILABLE");
  }
});

test("node versions preserve legacy graphs, retain v1 and reject unsupported values", () => {
  const legacy = structuredClone(validSwitchGraph);
  assert.equal(Object.hasOwn(parseWorkflowGraph(legacy).nodes[0]!, "nodeVersion"), false);
  const explicit = structuredClone(validSwitchGraph);
  explicit.nodes[0]!.nodeVersion = 1;
  assert.equal(parseWorkflowGraph(explicit).nodes[0]?.nodeVersion, 1);
  for (const invalidVersion of [0, 2, -1, 1.5, null, "1"]) {
    const graph = structuredClone(validSwitchGraph) as unknown as { nodes: Array<Record<string, unknown>>; edges: unknown[] };
    graph.nodes[0]!.nodeVersion = invalidVersion;
    assert.throws(() => parseWorkflowGraph(graph), BadRequestException);
  }
});

test("historical and .v2 node identities survive API parsing with or without nodeVersion", () => {
  for (const base of ["trigger.uptime-kuma.alert", "action.google-drive", "action.google-sheets", "action.google-chat.oauth", "action.gmail.read", "action.notion.search-pages", "action.sentry.list-issues", "action.vercel.list-deployments", "action.postgres.select", "action.supabase.select"]) {
    for (const suffix of ["", ".v2"]) for (const version of [undefined, 1]) {
      const node = { id: "historical", type: base + suffix, ...(version === undefined ? {} : { nodeVersion: version }), position: { x: 2, y: 3 }, config: { savedValue: "preserve" } };
      assert.deepEqual(parseWorkflowGraph({ nodes: [node], edges: [] }).nodes[0], node);
    }
  }
});

test("mixed canvas and API node versions cannot silently conflict", () => {
  const node = { id: "read", type: "workflowNode", nodeVersion: 1, position: { x: 0, y: 0 }, data: { nodeType: "action.supabase.select.v2", nodeVersion: 2, config: { table: "items" } } };
  assert.throws(() => parseWorkflowGraph({ nodes: [node], edges: [] }), (error: unknown) => error instanceof BadRequestException && String(error.message).includes("version"));
  assert.equal(parseWorkflowGraph({ nodes: [{ ...node, data: { ...node.data, nodeVersion: 1 } }], edges: [] }).nodes[0]?.nodeVersion, 1);
  assert.equal(parseWorkflowGraph({ nodes: [{ ...node, nodeVersion: undefined, data: { ...node.data, nodeVersion: 1 } }], edges: [] }).nodes[0]?.nodeVersion, 1);
  assert.equal(parseWorkflowGraph({ nodes: [{ ...node, data: { ...node.data, nodeVersion: undefined } }], edges: [] }).nodes[0]?.nodeVersion, 1);
});

test("RSS drafts allow incomplete URLs without DNS but reject identifiable secrets", () => {
  const graph = (url: string) => ({ nodes: [{ id: "rss", type: "trigger.rss.new-item", position: { x: 0, y: 0 }, config: { url, pollMinutes: "5" } }], edges: [] });
  assert.doesNotThrow(() => parseWorkflowGraph(graph("")));
  assert.throws(() => validatePublishableGraph(parseWorkflowGraph(graph(""))), BadRequestException);
  assert.doesNotThrow(() => validatePublishableGraph(parseWorkflowGraph(graph("https://feeds.example.test/path?lang=vi"))));
  assert.throws(() => parseWorkflowGraph(graph("https://feeds.example.test/path?token=private")), (error: unknown) => error instanceof BadRequestException && !String(error).includes("private"));
});
