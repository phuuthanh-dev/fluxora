import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { resolveExpressions } from "./expression";
import { redactValue } from "./redaction";
import { isRetryableFailure, retryDelayMs } from "./retry-policy";

test("resolves safe expressions without evaluating JavaScript", () => {
  const context = { steps: { steam: { output: { profile: { personaname: "Thanh" } } } } };
  assert.equal(resolveExpressions("Hello {{ upper(steps.steam.output.profile.personaname) }}", context), "Hello THANH");
  assert.equal(resolveExpressions("{{ steps.steam.output.profile.personaname }}", context), "Thanh");
  assert.throws(() => resolveExpressions("{{ process.exit() }}", context), BadRequestException);
});

test("redacts nested provider secrets before execution data is persisted", () => {
  assert.deepEqual(redactValue({ authorization: "Bearer secret", nested: { apiKey: "abc", safe: "visible" } }), {
    authorization: "[REDACTED]",
    nested: { apiKey: "[REDACTED]", safe: "visible" },
  });
});

test("retries only transient failures with capped exponential backoff", () => {
  assert.equal(isRetryableFailure({ code: "NETWORK_ERROR" }), true);
  assert.equal(isRetryableFailure({ code: "HTTP_ERROR", statusCode: 503 }), true);
  assert.equal(isRetryableFailure({ code: "HTTP_ERROR", statusCode: 401 }), false);
  assert.equal(retryDelayMs(1), 500);
  assert.equal(retryDelayMs(8), 30_000);
});
