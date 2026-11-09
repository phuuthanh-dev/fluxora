import assert from "node:assert/strict";
import test from "node:test";
import { buildExpressionPreviews, buildExpressionSuggestions, buildItemExpressionSuggestions, buildPossibleExpressionSuggestions, upstreamNodeIds } from "./expression-suggestions";

test("previews selected output values without expanding objects or unbounded text", () => {
  const previews = buildExpressionPreviews([{ nodeId: "steam", output: { title: "A game update", long: "x".repeat(120), items: [{ count: 2 }], private: "[REDACTED]" } }]);
  assert.equal(previews["{{ steps.steam.output.title }}"], "A game update");
  assert.equal(previews["{{ steps.steam.output.items }}"], "List · 1 items");
  assert.equal(previews["{{ steps.steam.output.items[0].count }}"], "2");
  assert.ok(previews["{{ steps.steam.output.long }}"]!.length <= 80);
  assert.equal(previews["{{ steps.steam.output.private }}"], "[REDACTED]");
});

test("suggests current item fields for a supported list", () => {
  const node = { id: "read", data: { nodeType: "action.mongodb", config: {} } };
  assert.deepEqual(buildItemExpressionSuggestions(node, { documents: [{ name: "demo" }] }, false), ["{{ $json }}", "{{ $json.name }}"]);
  assert.deepEqual(buildItemExpressionSuggestions(node, { documents: [] }, false), []);
});

test("expression suggestions include nested output paths and a safe array index", () => {
  const suggestions = buildExpressionSuggestions([{ nodeId: "steam", output: { profile: { personaname: "Thanh" }, summary: { topGames: [{ name: "Hades" }] } } }]);
  assert.ok(suggestions.includes("{{ steps.steam.output.profile.personaname }}"));
  assert.ok(suggestions.includes("{{ steps.steam.output.summary.topGames[0].name }}"));
});

test("suggestions include hyphenated keys supported by the expression parser", () => {
  const suggestions = buildExpressionSuggestions([{ nodeId: "node-example", output: { "request-id": "abc", "not supported": "skip" } }]);
  assert.ok(suggestions.includes("{{ steps.node-example.output.request-id }}"));
  assert.ok(!suggestions.some((value) => value.includes("not supported")));
});

test("possible fields come only from reachable upstream nodes and valid expression identifiers", () => {
  const upstream = upstreamNodeIds("target", [
    { source: "trigger", target: "source" }, { source: "source", target: "target" },
    { source: "other", target: "unrelated" }, { source: "target", target: "source" },
  ]);
  assert.deepEqual([...upstream].sort(), ["source", "trigger"]);
  const possible = buildPossibleExpressionSuggestions([
    { id: "source", data: { nodeType: "action.mongodb" } },
    { id: "trigger", data: { nodeType: "trigger.manual" } },
    { id: "other", data: { nodeType: "action.mongodb" } },
    { id: "target", data: { nodeType: "action.mongodb" } },
    { id: "1-invalid", data: { nodeType: "action.mongodb" } },
  ], new Set([...upstream, "1-invalid"]));
  assert.ok(possible.includes("{{ steps.source.output.documents }}"));
  assert.ok(possible.includes("{{ steps.trigger.output.received }}"));
  assert.ok(!possible.some((item) => /steps\.(other|target|1-invalid)\./.test(item)));
  assert.deepEqual(buildExpressionSuggestions([{ nodeId: "1-invalid", output: { value: 1 } }]), []);
});

test("structured AI fields are suggested only from an applied, valid schema", () => {
  const schema = { type: "object", properties: { summary: { type: "string" }, "invalid field": { type: "string" } }, required: ["summary", "invalid field"], additionalProperties: false };
  for (const nodeType of ["action.gemini", "action.openai"]) {
    const node = { id: "ai", data: { nodeType, config: { outputSchema: schema } } };
    const suggestions = buildPossibleExpressionSuggestions([node], new Set(["ai"]));
    assert.ok(suggestions.includes("{{ steps.ai.output.json.summary }}"));
    assert.ok(!suggestions.some((item) => item.includes("invalid field")));
    assert.ok(!buildPossibleExpressionSuggestions([{ ...node, data: { nodeType, config: {} } }], new Set(["ai"])).some((item) => item.includes(".json")));
    assert.ok(!buildPossibleExpressionSuggestions([{ ...node, data: { nodeType, config: { outputSchema: { type: "object" } } } }], new Set(["ai"])).some((item) => item.includes(".json")));
  }
});
