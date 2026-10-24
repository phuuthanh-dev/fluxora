import assert from "node:assert/strict";
import test from "node:test";
import { nextUnmappedSwitchCase } from "./editor-store";

test("maps each new Switch case edge to the next configured case", () => {
  const config = { cases: [{ value: "public" }, { value: "private" }] };
  assert.equal(nextUnmappedSwitchCase(config, []), "public");
  assert.equal(nextUnmappedSwitchCase(config, [{ id: "public", source: "switch", target: "one", kind: "case", caseValue: "public" }]), "private");
  assert.equal(nextUnmappedSwitchCase(config, [
    { id: "public", source: "switch", target: "one", kind: "case", caseValue: "public" },
    { id: "private", source: "switch", target: "two", kind: "case", caseValue: "private" },
  ]), undefined);
});
