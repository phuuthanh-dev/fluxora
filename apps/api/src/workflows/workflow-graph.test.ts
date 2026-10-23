import assert from "node:assert/strict";
import test from "node:test";
import type { WorkflowGraph } from "@workflow/contracts";
import { BadRequestException } from "@nestjs/common";
import { validatePublishableGraph } from "./workflow-graph";

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
