import assert from "node:assert/strict";
import test from "node:test";
import { initialEdges, initialNodes } from "./node-catalog";
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
