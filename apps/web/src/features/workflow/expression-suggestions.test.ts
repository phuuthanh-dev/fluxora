import assert from "node:assert/strict";
import test from "node:test";
import { buildExpressionSuggestions } from "./expression-suggestions";

test("expression suggestions include nested output paths and a safe array index", () => {
  const suggestions = buildExpressionSuggestions([{ nodeId: "steam", output: { profile: { personaname: "Thanh" }, summary: { topGames: [{ name: "Hades" }] } } }]);
  assert.ok(suggestions.includes("{{ steps.steam.output.profile.personaname }}"));
  assert.ok(suggestions.includes("{{ steps.steam.output.summary.topGames[0].name }}"));
});
