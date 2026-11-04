import assert from "node:assert/strict";
import test from "node:test";
import { diagnosticFileName, executionFailureExplanation, outputHasList, type ExecutionNodeDetail } from "./execution-observability";

test("list guidance appears for direct output lists and not scalar output", () => {
  assert.equal(outputHasList([{ id: 1 }]), true);
  assert.equal(outputHasList({ rows: [{ id: 1 }] }), true);
  assert.equal(outputHasList({ count: 1, page: { next: null } }), false);
  assert.equal(outputHasList(null), false);
});

const node = (overrides: Partial<ExecutionNodeDetail>): ExecutionNodeDetail => ({
  nodeId: "notify",
  nodeType: "action.telegram.message",
  status: "FAILED",
  attempt: 2,
  input: null,
  output: null,
  error: { code: "NETWORK_ERROR", message: "Network unavailable", retryable: true },
  startedAt: null,
  completedAt: null,
  durationMs: 250,
  failureHandling: { kind: "error_branch", targetNodeIds: ["fallback"] },
  skipReason: null,
  ...overrides,
});

test("execution explanation distinguishes retryability and error-branch routing", () => {
  assert.equal(executionFailureExplanation(node({})), "Transient failure; automatic attempts stopped after attempt 2. Routed through the error branch to fallback.");
  assert.equal(executionFailureExplanation(node({ error: { code: "INVALID_CONFIGURATION", message: "Invalid", retryable: false }, failureHandling: { kind: "execution_failed", targetNodeIds: [] } })), "The latest failure is not retryable automatically. No error branch was connected, so the execution stopped.");
});

test("execution explanation gives explicit reasons for skipped nodes", () => {
  assert.equal(executionFailureExplanation(node({ status: "SKIPPED", error: null, failureHandling: null, skipReason: "branch_not_selected" })), "Skipped because another condition or switch branch was selected.");
  assert.equal(executionFailureExplanation(node({ status: "SKIPPED", error: null, failureHandling: null, skipReason: "execution_cancelled" })), "Skipped because the execution was cancelled.");
});

test("diagnostic file name is stable for the same execution", () => {
  assert.equal(diagnosticFileName("execution-123"), "fluxora-execution-execution-123-diagnostic.json");
});
