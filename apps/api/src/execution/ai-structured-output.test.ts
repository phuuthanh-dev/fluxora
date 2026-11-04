import assert from "node:assert/strict";
import test from "node:test";
import { mockAiOutput, normalizeAiUsage, parseAiOutput, parseAiSchema } from "./ai-structured-output";
import { NodeFailure } from "./node-failure";

const schema = { type: "object", properties: { name: { type: "string", enum: ["a", "b"] }, count: { type: "integer" }, nested: { type: "array", items: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } } }, required: ["name", "count", "nested"], additionalProperties: false };
const invalidInput = (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT" && !error.retryable;
const invalidOutput = (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_STRUCTURED_OUTPUT" && !error.retryable && !error.message.includes("private");

test("structured output validates nested JSON and makes a valid mock", () => {
  const parsed = parseAiSchema(schema)!;
  const value = { name: "a", count: 2, nested: [{ ok: true }] };
  assert.deepEqual(parseAiOutput(JSON.stringify(value), parsed), value);
  const mock = mockAiOutput(parsed);
  assert.deepEqual(parseAiOutput(JSON.stringify(mock), parsed), mock);
  assert.equal(parseAiSchema(undefined), undefined);
});

test("unsupported, open, recursive and excessive schemas fail closed", () => {
  const cyclic: Record<string, unknown> = { type: "array" };
  cyclic.items = cyclic;
  for (const bad of [null, { type: "string" }, { ...schema, additionalProperties: true }, { ...schema, required: ["name"] }, { ...schema, description: 123 }, { ...schema, properties: { x: cyclic }, required: ["x"] }, { ...schema, properties: { x: { type: "string", enum: [] } }, required: ["x"] }, { ...schema, properties: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`k${i}`, { type: "string" }])), required: [] }]) assert.throws(() => parseAiSchema(bad), invalidInput);
});

test("malformed JSON, missing, extra, wrong and unsafe values fail without content leakage", () => {
  const parsed = parseAiSchema(schema)!;
  for (const text of ["private {", '{"name":"private","count":1,"nested":[]}', '{"name":"a","count":1,"nested":[],"extra":"private"}', '{"name":"a","count":1.5,"nested":[]}', '{"name":"a","count":9007199254740992,"nested":[]}', '{"name":"a","count":1,"nested":[{"ok":"private"}]}']) assert.throws(() => parseAiOutput(text, parsed), invalidOutput);
});

test("structured output rejects numbers that change when parsed without leaking content", () => {
  const parsed = parseAiSchema({ type: "object", properties: { value: { type: "number" }, label: { type: "string" } }, required: ["value", "label"], additionalProperties: false })!;
  for (const number of ["9007199254740991.1", "9007199254740993", "0.10000000000000001", "1e-999", "1e999"]) {
    assert.throws(() => parseAiOutput(`{"value":${number},"label":"private"}`, parsed), invalidOutput);
  }
  for (const number of ["0.100", "12.50", "1e-7", "-0.0"]) {
    assert.equal((parseAiOutput(`{"value":${number},"label":"0.10000000000000001"}`, parsed) as { value: number }).value, Number(number));
  }
});

test("usage includes only valid nonnegative integer fields and does not invent totals", () => {
  assert.deepEqual(normalizeAiUsage({ a: 4, b: -1, c: 2.5 }, { input: "a", output: "b", total: "c" }), { inputTokens: 4 });
  assert.equal(normalizeAiUsage({ a: "4" }, { input: "a", output: "b", total: "c" }), undefined);
});

test("shared schema supports bounded descriptions and rejects reserved names and unsafe errors", () => {
  const valid = { type: "object", description: "", properties: { answer: { type: "string", description: "A brief answer" } }, required: ["answer"], additionalProperties: false };
  assert.deepEqual(parseAiSchema(valid), valid);
  for (const name of ["__proto__", "prototype", "constructor"]) {
    const properties = Object.fromEntries([[name, { type: "string" }]]);
    assert.throws(() => parseAiSchema({ ...valid, properties, required: [name] }), invalidInput);
  }
  for (const description of [null, 42, "x".repeat(1001)]) assert.throws(() => parseAiSchema({ ...valid, description }), invalidInput);
  assert.throws(() => parseAiSchema({ ...valid, private_keyword: "sensitive-value" }), (error: unknown) => invalidInput(error) && error instanceof Error && !error.message.includes("sensitive-value"));
  assert.throws(() => parseAiSchema({ ...valid, properties: { answer: { type: "string", enum: undefined } } }), invalidInput);
});

test("shared schema enforces the aggregate enum bound", () => {
  const withFields = (count: number) => {
    const properties = Object.fromEntries(Array.from({ length: count }, (_, i) => [`f${i}`, { type: "string", enum: Array.from({ length: 50 }, (_, j) => `v${j}`) }]));
    return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
  };
  assert.ok(parseAiSchema(withFields(20)));
  assert.throws(() => parseAiSchema(withFields(21)), invalidInput);
});
