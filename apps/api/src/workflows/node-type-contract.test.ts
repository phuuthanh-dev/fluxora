import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkflowGraph } from "./workflow-graph";

test("current connector names parse and unsupported suffixes are rejected", () => {
  for (const type of ["trigger.uptime-kuma.alert", "action.postgres.select", "action.supabase.select", "action.google-drive", "action.google-sheets", "action.google-chat.oauth", "action.gmail.read", "action.notion.search-pages", "action.sentry.list-issues", "action.vercel.list-deployments"]) {
    const node = { id: "node", type, position: { x: 0, y: 0 }, config: {} };
    assert.equal(parseWorkflowGraph({ nodes: [node], edges: [] }).nodes[0]?.type, type);
    assert.throws(() => parseWorkflowGraph({ nodes: [{ ...node, type: `${type}.v2` }], edges: [] }));
  }
});
