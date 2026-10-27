import assert from "node:assert/strict";
import test from "node:test";
import { parseApprovedSlices, parseLoopLedger, validateTaskTargets } from "./agent-state-check.mjs";

const ledger = `| Loop | Outcome | Status | Proof required |\n|---|---|---:|---|\n| L8.4 | Shared shell | Complete locally | tests |\n| L9.1 | Templates | Complete | tests |\n| L12.1 | Future | Planned | proof |`;
const state = `## Next approved slices\n| ID | Outcome | Status | Owner/evidence boundary |\n|---|---|---|---|\n| \`UX-1\` | Credential references | planned | local |\n| \`OPS-1\` | VPS evidence | operator-gated | operator |`;

test("parses completed delivery ledger rows without treating planned rows as complete", () => {
  const rows = parseLoopLedger(ledger);
  assert.equal(rows.get("L8.4").status, "Complete locally");
  assert.equal(rows.get("L12.1").status, "Planned");
});

test("parses approved follow-up IDs and statuses", () => {
  const rows = parseApprovedSlices(state);
  assert.equal(rows.get("UX-1").status, "planned");
  assert.equal(rows.get("OPS-1").status, "operator-gated");
});

test("rejects a task that repeats a completed slice", () => {
  assert.throws(
    () => validateTaskTargets("## Target slice IDs\n- `L8.4`", parseLoopLedger(ledger), parseApprovedSlices(state)),
    /L8\.4 is already Complete locally/
  );
});

test("allows an approved non-code follow-up slice", () => {
  const targets = validateTaskTargets("## Target slice IDs\n- `OPS-1`", parseLoopLedger(ledger), parseApprovedSlices(state));
  assert.deepEqual(targets, ["OPS-1"]);
});

test("requires a concrete justification to reopen a completed slice", () => {
  const task = `## Target slice IDs\n- \`L8.4\`\n\n## Reopen justification\nA reproducible regression was found in the shared shell after the production merge and needs a targeted fix.`;
  const targets = validateTaskTargets(task, parseLoopLedger(ledger), parseApprovedSlices(state));
  assert.deepEqual(targets, ["L8.4"]);
});
