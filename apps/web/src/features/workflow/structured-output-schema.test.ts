import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStructuredOutputSchema,
  parseStructuredOutputJson,
  parseStructuredOutputSchema,
  structuredOutputBaseline,
  STRUCTURED_OUTPUT_MAX_DESCRIPTION_LENGTH,
  STRUCTURED_OUTPUT_MAX_FIELDS,
  STRUCTURED_OUTPUT_MAX_NAME_LENGTH,
  type StructuredOutputModel,
} from "./structured-output-schema";

test("builds a strict, fully required schema with typed fields and descriptions", () => {
  const model: StructuredOutputModel = { description: "Extract the result", fields: [
    { name: "summary", type: "string", description: "A short summary" },
    { name: "score", type: "number" }, { name: "count", type: "integer" },
    { name: "approved", type: "boolean" }, { name: "missing", type: "null", description: "" },
  ] };
  const schema = buildStructuredOutputSchema(model);
  assert.deepEqual(schema, { type: "object", properties: {
    summary: { type: "string", description: "A short summary" }, score: { type: "number" },
    count: { type: "integer" }, approved: { type: "boolean" }, missing: { type: "null", description: "" },
  }, required: ["summary", "score", "count", "approved", "missing"], additionalProperties: false, description: "Extract the result" });
  assert.deepEqual(parseStructuredOutputSchema(schema), model);
});

test("round-trips unusual valid property names without prototype mutation", () => {
  const model: StructuredOutputModel = { fields: [{ name: "safe-name", type: "string" }, { name: "2", type: "integer" }, { name: "a name", type: "boolean" }] };
  const schema = buildStructuredOutputSchema(model);
  assert.equal(Object.getPrototypeOf(schema.properties), Object.prototype);
  assert.deepEqual(schema.properties["safe-name"], { type: "string" });
  assert.deepEqual(schema.required, ["2", "safe-name", "a name"]);
  assert.deepEqual(buildStructuredOutputSchema(parseStructuredOutputSchema(schema)!), schema);
});

test("rejects incomplete, duplicate, out-of-bounds and unsupported visual drafts", () => {
  const invalid: StructuredOutputModel[] = [
    { fields: [] }, { fields: [{ name: " ", type: "string" }] },
    { fields: [{ name: "x", type: "string" }, { name: "x", type: "number" }] },
    { fields: [{ name: "x".repeat(STRUCTURED_OUTPUT_MAX_NAME_LENGTH + 1), type: "string" }] },
    { fields: [{ name: "x", type: "string", description: "x".repeat(STRUCTURED_OUTPUT_MAX_DESCRIPTION_LENGTH + 1) }] },
    { fields: Array.from({ length: STRUCTURED_OUTPUT_MAX_FIELDS + 1 }, (_, i) => ({ name: String(i), type: "string" as const })) },
    { fields: [{ name: "x", type: "array" as never }] },
    { fields: [{ name: "__proto__", type: "string" }] },
    { fields: [{ name: "constructor", type: "string" }] },
  ];
  for (const model of invalid) assert.throws(() => buildStructuredOutputSchema(model));
});

test("refuses to visually interpret schemas that would lose information", () => {
  const simple = { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false };
  const unsupported: unknown[] = [
    null, [], "{}", { ...simple, title: "Keep me" }, { ...simple, additionalProperties: true },
    { ...simple, required: [] }, { ...simple, required: ["name", "name"] },
    { ...simple, properties: { name: { type: "string", enum: ["a", "b"] } } },
    { ...simple, properties: { name: { type: "array", items: { type: "string" } } } },
    { ...simple, properties: { name: { type: ["string", "null"] } } },
    { ...simple, properties: { name: { type: "object", properties: {} } } },
    { ...simple, description: 123 },
    { type: "object", properties: { a: { type: "string" }, b: { type: "boolean" } }, required: ["b", "a"], additionalProperties: false },
  ];
  for (const value of unsupported) assert.equal(parseStructuredOutputSchema(value), null);
  assert.deepEqual(parseStructuredOutputSchema(undefined), { fields: [] });
});

test("advanced JSON retains supported nested schemas and rejects invalid input", () => {
  const text = '{"type":"object","properties":{"tags":{"type":"array","items":{"type":"string"}}},"required":["tags"],"additionalProperties":false}';
  const schema = parseStructuredOutputJson(text);
  assert.deepEqual(schema, JSON.parse(text));
  assert.equal(parseStructuredOutputSchema(schema), null);
  assert.throws(() => parseStructuredOutputJson('{"type":"object","properties":{},"required":[],"additionalProperties":false,"x-custom":true}'));
  for (const input of ["{", "null", "[]", '"text"', '{"a":1,"a":2}', '{"nested":[{"a":1,"\\u0061":2}]}']) assert.throws(() => parseStructuredOutputJson(input));
  assert.throws(() => parseStructuredOutputJson('{"a":{"x":1},"b":{"x":2}}'));
});

test("draft baseline distinguishes absent and changed schema values", () => {
  const original = { type: "object", properties: {}, required: [], additionalProperties: false };
  assert.notEqual(structuredOutputBaseline(undefined), structuredOutputBaseline(original));
  assert.equal(structuredOutputBaseline(original), structuredOutputBaseline({ ...original }));
  assert.notEqual(structuredOutputBaseline(original), structuredOutputBaseline({ ...original, description: "changed" }));
});
