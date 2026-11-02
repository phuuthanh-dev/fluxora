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

test("RSS drafts allow incomplete URLs without DNS but reject identifiable secrets", () => {
  const graph = (url: string) => ({ nodes: [{ id: "rss", type: "trigger.rss.new-item", position: { x: 0, y: 0 }, config: { url, pollMinutes: "5" } }], edges: [] });
  assert.doesNotThrow(() => parseWorkflowGraph(graph("")));
  assert.throws(() => validatePublishableGraph(parseWorkflowGraph(graph(""))), BadRequestException);
  assert.doesNotThrow(() => validatePublishableGraph(parseWorkflowGraph(graph("https://feeds.example.test/path?lang=vi"))));
  assert.throws(() => parseWorkflowGraph(graph("https://feeds.example.test/path?token=private")), (error: unknown) => error instanceof BadRequestException && !String(error).includes("private"));
});
