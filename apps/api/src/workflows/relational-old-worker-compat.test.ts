import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { BadRequestException } from "@nestjs/common";
import { parseWorkflowGraph } from "./workflow-graph";

// Frozen, unmodified files from 3c9ac35: exercise the actual old parser with
// the old type registry, rather than a reimplementation of its condition.
function loadLegacyModule(name: string, dependencies: Record<string, unknown>): Record<string, unknown> {
  const source = readFileSync(join(__dirname, "fixtures/legacy-3c9ac35", name), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, unknown> = {};
  const sandbox = { exports, require: (id: string) => {
    if (!Object.hasOwn(dependencies, id)) throw new Error(`Unexpected dependency: ${id}`);
    return dependencies[id];
  } };
  runInNewContext(compiled, sandbox);
  return exports;
}

test("old worker parser rejects the entire graph containing a distinct v2 type", () => {
  const contracts = loadLegacyModule("contracts.ts.txt", {});
  const legacy = loadLegacyModule("workflow-graph.ts.txt", { "@workflow/contracts": contracts, "@nestjs/common": { BadRequestException } });
  const parseOld = legacy.parseWorkflowGraph as (value: unknown) => unknown;
  const trigger = { id: "start", type: "trigger.manual", position: { x: 0, y: 0 }, config: {} };
  for (const type of ["trigger.uptime-kuma.alert.v2", "action.postgres.select.v2", "action.supabase.select.v2", "action.google-drive.v2", "action.gmail.read.v2", "action.notion.search-pages.v2", "action.sentry.list-issues.v2", "action.vercel.list-deployments.v2"]) {
    const node = { id: "read", type, nodeVersion: 1, position: { x: 1, y: 0 }, config: { table: "items", columns: ["id"] } };
    const graph = { nodes: [trigger, node], edges: [{ id: "edge", source: "start", target: "read", kind: "success" }] };
    assert.throws(() => parseOld(graph), BadRequestException);
    assert.equal(parseWorkflowGraph(graph).nodes[1]?.type, type);
  }
});
