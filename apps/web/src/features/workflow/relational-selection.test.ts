import assert from "node:assert/strict";
import test from "node:test";
import { buildRelationalSelection, isRelationalBaselineCurrent, parseRelationalManual, parseRelationalSelection, relationalBaseline, upgradeRelationalNode, type RelationalProvider } from "./relational-selection";

import { createNodeData, getNodeDefinition } from "./node-catalog";
import { graphForApi, graphFromApi } from "./workflow-api";

const build = (value: Record<string, unknown>, provider: RelationalProvider) => buildRelationalSelection(parseRelationalSelection(value, provider)!, provider);

test("PostgreSQL round trips typed conditions, sorting, offset and absent keys", () => {
  const selection = { columns: ["name", "amount"], conditions: [{ column: "name", operator: "notEquals", value: "pending" }, { column: "amount", operator: "greaterThan", value: 3.5 }, { column: "active", operator: "equals", value: false }, { column: "amount", operator: "lessThan", value: 20 }], orderBy: "amount", orderDirection: "desc", offset: 100_000 };
  assert.deepEqual(build(selection, "postgres"), selection);
  assert.deepEqual(build({}, "postgres"), {});
  assert.deepEqual(build({ orderBy: "id" }, "postgres"), { orderBy: "id" });
  const form = parseRelationalSelection({ orderBy: "id", columns: [] }, "postgres")!;
  assert.deepEqual(buildRelationalSelection({ ...form, offset: "5" }, "postgres"), { orderBy: "id", columns: [], offset: 5 });
});

test("Supabase round trips all operators, ordered sorts and null placement", () => {
  const selection = { columns: ["id"], filters: [{ column: "a", operator: "greaterThanOrEqual", value: 2 }, { column: "b", operator: "lessThanOrEqual", value: 8 }, { column: "c", operator: "isNull" }, { column: "d", operator: "isNotNull" }, { column: "active", operator: "equals", value: false }], order: [{ column: "a", direction: "desc", nulls: "first" }, { column: "id", direction: "asc", nulls: "last" }], offset: 1_000_000 };
  assert.deepEqual(build(selection, "supabase"), selection);
  const form = parseRelationalSelection(selection, "supabase")!;
  assert.deepEqual(buildRelationalSelection({ ...form, columns: ["id", "other"] }, "supabase"), { ...selection, columns: ["id", "other"] });
  assert.deepEqual(build({}, "supabase"), {});
});

test("unsupported or ambiguous shapes stay in advanced settings without loss", () => {
  for (const [selection, provider] of [
    [{ columns: "{{ steps.query.output.columns }}" }, "postgres"],
    [{ conditions: [{ column: "id", operator: "equals", value: "{{ steps.a.output.id }}" }] }, "postgres"],
    [{ conditions: [{ column: "id", operator: "in", value: [1, 2] }] }, "postgres"],
    [{ conditions: [{ column: "id", operator: "equals", value: 1, extra: true }] }, "postgres"],
    [{ conditions: null }, "postgres"], [{ offset: -1 }, "postgres"], [{ offset: 100_001 }, "postgres"],
    [{ orderDirection: "desc" }, "postgres"], [{ extra: 1 }, "postgres"],
    [{ filters: [] }, "postgres"], [{ conditions: [] }, "supabase"],
    [{ filters: [{ column: "x", operator: "isNull", value: null }] }, "supabase"],
    [{ filters: [{ column: "select", operator: "equals", value: 1 }] }, "supabase"],
    [{ order: [{ column: "id", direction: "asc", extra: true }] }, "supabase"],
    [{ order: [{ column: "id", direction: "asc", nulls: null }] }, "supabase"],
    [{ offset: 1 }, "supabase"], [{ offset: 1_000_001 }, "supabase"],
  ] as Array<[Record<string, unknown>, RelationalProvider]>) assert.equal(parseRelationalSelection(selection, provider), null);
  const text = '{"columns":"{{ steps.query.output.columns }}","filters":[{"other":true}],"order":[{"custom":true}]}';
  assert.deepEqual(parseRelationalManual(text), JSON.parse(text));
  assert.throws(() => parseRelationalManual('{"limit":20}'));
  assert.throws(() => parseRelationalManual("[1]"));
  assert.throws(() => parseRelationalManual("{"));
});

test("visual validation enforces provider boundaries and allows manual names absent from metadata", () => {
  const pg = parseRelationalSelection({ conditions: [{ column: "amount", operator: "equals", value: 1 }] }, "postgres")!;
  assert.throws(() => buildRelationalSelection({ ...pg, conditions: [{ ...pg.conditions[0]!, value: "" }] }, "postgres"));
  assert.throws(() => buildRelationalSelection({ ...pg, conditions: [{ ...pg.conditions[0]!, value: "Infinity" }] }, "postgres"));
  assert.throws(() => buildRelationalSelection({ ...pg, offset: "100001" }, "postgres"));
  assert.throws(() => buildRelationalSelection({ ...pg, offset: "-1" }, "postgres"));
  assert.throws(() => buildRelationalSelection({ ...pg, columns: ["name", "name"] }, "postgres"));
  assert.throws(() => buildRelationalSelection({ ...pg, columns: ["name; SELECT *"] }, "postgres"));
  assert.throws(() => buildRelationalSelection({ ...pg, conditions: [{ ...pg.conditions[0]!, operator: "isNull" }] }, "postgres"));
  assert.deepEqual(buildRelationalSelection({ ...pg, columns: ["manual_column"] }, "postgres"), { conditions: [{ column: "amount", operator: "equals", value: 1 }], columns: ["manual_column"] });
  const sb = parseRelationalSelection({}, "supabase")!;
  assert.throws(() => buildRelationalSelection({ ...sb, offset: "1" }, "supabase"));
  assert.throws(() => buildRelationalSelection({ ...sb, offset: "1000001" }, "supabase"));
  assert.throws(() => buildRelationalSelection({ ...sb, conditions: [{ column: "order", operator: "equals", type: "string", value: "x" }] }, "supabase"));
  assert.throws(() => buildRelationalSelection({ ...sb, conditions: [{ column: "name", operator: "equals", type: "string", value: "é".repeat(501) }] }, "supabase"));
  assert.throws(() => buildRelationalSelection({ ...sb, conditions: [{ column: "name", operator: "equals", type: "string", value: "bad\nvalue" }] }, "supabase"));
  assert.throws(() => buildRelationalSelection({ ...sb, conditions: [{ column: "name", operator: "equals", type: "string", value: "{{ steps.a.output.id }}" }] }, "supabase"));
  assert.throws(() => buildRelationalSelection({ ...sb, order: Array.from({ length: 11 }, () => ({ column: "id", direction: "asc" as const, nulls: "" as const })) }, "supabase"));
  assert.throws(() => buildRelationalSelection({ ...sb, conditions: Array.from({ length: 9 }, (_, i) => ({ column: `c${i}`, operator: "equals" as const, type: "string" as const, value: "?".repeat(500) })) }, "supabase"));
  assert.deepEqual(buildRelationalSelection({ ...sb, conditions: [{ column: "field", operator: "isNull", type: "string", value: "ignored" }] }, "supabase"), { filters: [{ column: "field", operator: "isNull" }] });
});

test("baseline detects selection, resource, revision and provider changes", () => {
  const value = { columns: ["name"] };
  const baseline = relationalBaseline(value, "node/connection/schema/table/revision-1", "postgres");
  assert.equal(isRelationalBaselineCurrent(baseline, { columns: ["name"] }, "node/connection/schema/table/revision-1", "postgres"), true);
  assert.equal(isRelationalBaselineCurrent(baseline, { columns: ["id"] }, "node/connection/schema/table/revision-1", "postgres"), false);
  assert.equal(isRelationalBaselineCurrent(baseline, value, "node/connection/schema/table/revision-2", "postgres"), false);
  assert.equal(isRelationalBaselineCurrent(baseline, value, "node/connection/schema/table/revision-1", "supabase"), false);
});

test("visual numeric values reject unsafe integers before precision is lost", () => {
  for (const provider of ["postgres", "supabase"] as const) {
    const form = parseRelationalSelection({}, provider)!;
    const row = { column: "id", operator: "equals" as const, type: "number" as const, value: "" };
    for (const value of ["9007199254740992", "-9007199254740993", "9.007199254740993e15", "9007199254740991.1"]) {
      assert.throws(() => buildRelationalSelection({ ...form, conditions: [{ ...row, value }] }, provider), /Choose Text/);
    }
    const safe = buildRelationalSelection({ ...form, conditions: [{ ...row, value: "9007199254740991" }] }, provider);
    assert.equal((safe[provider === "postgres" ? "conditions" : "filters"] as Array<{ value: number }>)[0]!.value, Number.MAX_SAFE_INTEGER);
    const text = buildRelationalSelection({ ...form, conditions: [{ ...row, type: "string", value: "9007199254740993" }] }, provider);
    assert.equal((text[provider === "postgres" ? "conditions" : "filters"] as Array<{ value: string }>)[0]!.value, "9007199254740993");
    assert.equal(parseRelationalSelection({ [provider === "postgres" ? "conditions" : "filters"]: [{ column: "id", operator: "equals", value: 9007199254740992 }] }, provider), null);
  }
});


test("explicit upgrade preserves the entire config and only changes a draft node type", () => {
  for (const type of ["action.postgres.select", "action.supabase.select"] as const) {
    const config = { credentialId: "connection", table: "items", columns: ["id"], offset: 3, extra: { original: ["keep"] } };
    const legacy = { nodes: [{ id: "read", type, position: { x: 0, y: 0 }, config }], edges: [] };
    const canvas = graphFromApi(legacy);
    const node = canvas.nodes[0]!;
    const upgraded = upgradeRelationalNode(node.data)!;
    assert.equal(upgraded.nodeVersion, 1);
    assert.equal(upgraded.nodeType, `${type}.v2`);
    assert.deepEqual(upgraded.config, config);
    assert.equal(node.data.nodeVersion, undefined);
    const migrated = graphForApi({ ...canvas, nodes: [{ ...node, data: upgraded }] });
    assert.equal(migrated.nodes[0]?.nodeVersion, 1);
    assert.equal(migrated.nodes[0]?.type, `${type}.v2`);
    assert.deepEqual(migrated.nodes[0]?.config, config);
    assert.deepEqual(legacy.nodes[0]?.config, config);
    assert.equal(createNodeData(getNodeDefinition(`${type}.v2`)!).nodeVersion, 1);
    assert.equal(upgradeRelationalNode(upgraded), undefined);
  }
});
