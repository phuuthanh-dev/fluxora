import assert from "node:assert/strict";
import test from "node:test";
import { createNodeData, getNodeDefinition, initialEdges, initialNodes, nodeCatalog } from "./node-catalog";
import { parseWorkflowCanvasGraph } from "./workflow-graph-schema";

test("accepts a valid exported workflow graph", () => {
  const graph = parseWorkflowCanvasGraph(structuredClone({ nodes: initialNodes, edges: initialEdges }));

  assert.equal(graph.nodes.length, 3);
  assert.deepEqual(graph.edges.map((edge) => edge.kind), ["success", "success"]);
});

test("rejects malformed graph data before it reaches the editor", () => {
  assert.throws(
    () => parseWorkflowCanvasGraph({ nodes: [{}], edges: [] }),
    /Invalid input/,
  );
});

test("rejects an edge whose branch does not match its source node", () => {
  const graph = structuredClone({ nodes: initialNodes, edges: initialEdges });
  const firstEdge = graph.edges[0];
  assert.ok(firstEdge);
  firstEdge.kind = "true";

  assert.throws(
    () => parseWorkflowCanvasGraph(graph),
    /invalid branch/,
  );
});

test("keeps schema-only connector nodes importable while marking them unavailable", () => {
  for (const type of ["action.email", "action.google-chat.oauth", "action.openai", "action.gemini", "action.mongodb", "action.github", "action.facebook-meta", "action.instagram"]) {
    const definition = getNodeDefinition(type);
    assert.ok(definition);
    assert.equal(definition.available, false);
  }
  const email = getNodeDefinition("action.email");
  assert.ok(email);
  const graph = parseWorkflowCanvasGraph({ nodes: [{ id: "email", type: "workflowNode" as const, position: { x: 0, y: 0 }, data: createNodeData(email) }], edges: [] });
  assert.equal(graph.nodes[0]?.data.config.subject, "");
  assert.ok(nodeCatalog.length > 10);
});
