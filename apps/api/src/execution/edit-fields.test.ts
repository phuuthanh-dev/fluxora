import assert from "node:assert/strict";
import test from "node:test";
import { nodeConfigIssues } from "@workflow/contracts";
import { resolveExpressions } from "./expression";
import { executeNode } from "./execution.service";

const credentials = new Proxy({}, { get() { throw new Error("Transformation must not read credentials"); } }) as never;

test("edit fields resolves input and returns typed values in mock and live modes", async () => {
  const raw = { fields: [{ name: "title", type: "text", value: "{{ steps.news.output.title }}" }, { name: "count", type: "number", value: "42" }, { name: "ready", type: "boolean", value: true }] };
  const context = { steps: { news: { output: { title: "Example news" } } } };
  assert.deepEqual(nodeConfigIssues("action.edit-fields", raw, "static"), []);
  const config = resolveExpressions(raw, context) as typeof raw;
  const node = { id: "edit", type: "action.edit-fields" as const, position: { x: 0, y: 0 }, config: raw };
  for (const mode of ["mock", "live"] as const) {
    const result = await executeNode(node, config, context, mode, "workspace", credentials, "execution");
    assert.deepEqual(result.output, { title: "Example news", count: 42, ready: true });
  }
});

test("edit fields rejects missing, duplicate, unsafe or incorrectly typed values", () => {
  const invalid = [
    { fields: [] },
    { fields: [{ name: "a", type: "text", value: "x" }, { name: "a", type: "text", value: "y" }] },
    { fields: [{ name: "__proto__", type: "text", value: "x" }] },
    { fields: [{ name: "amount", type: "number", value: "abc" }] },
    { fields: [{ name: "ready", type: "boolean", value: undefined }] },
  ];
  for (const config of invalid) assert.equal(nodeConfigIssues("action.edit-fields", config, "resolved")[0]?.field, "fields");
  const unresolved = resolveExpressions({ fields: [{ name: "title", type: "text", value: "{{ steps.missing.output.title }}" }] }, { steps: {} }) as Record<string, unknown>;
  assert.equal(nodeConfigIssues("action.edit-fields", unresolved, "resolved")[0]?.field, "fields");
});
