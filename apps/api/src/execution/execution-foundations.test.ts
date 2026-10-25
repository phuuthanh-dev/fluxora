import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { resolveExpressions } from "./expression";
import { redactValue } from "./redaction";
import { isRetryableFailure, retryDelayMs } from "./retry-policy";

test("resolves safe expressions without evaluating JavaScript", () => {
  const context = { steps: { steam: { output: { profile: { personaname: "Thanh" }, summary: { topGames: [{ name: "Hades" }] } } } } };
  assert.equal(resolveExpressions("Hello {{ upper(steps.steam.output.profile.personaname) }}", context), "Hello THANH");
  assert.equal(resolveExpressions("{{ steps.steam.output.profile.personaname }}", context), "Thanh");
  assert.equal(resolveExpressions("{{ steps.steam.output.summary.topGames[0].name }}", context), "Hades");
  assert.throws(() => resolveExpressions("{{ process.exit() }}", context), BadRequestException);
});

test("redacts nested provider secrets before execution data is persisted", () => {
  assert.deepEqual(redactValue({
    authorization: "Bearer secret",
    webhookUrl: "https://discord.com/api/webhooks/123/abc",
    nested: {
      apiKey: "abc",
      botToken: "123456:ABC-DEF",
      safe: "visible",
      url: "https://api.telegram.org/bot123456:ABC-DEF/sendMessage",
    },
  }), {
    authorization: "[REDACTED]",
    webhookUrl: "[REDACTED]",
    nested: {
      apiKey: "[REDACTED]",
      botToken: "[REDACTED]",
      safe: "visible",
      url: "https://api.telegram.org/bot[REDACTED]/sendMessage",
    },
  });
});

test("retries only transient failures with capped exponential backoff", () => {
  assert.equal(isRetryableFailure({ code: "NETWORK_ERROR" }), true);
  assert.equal(isRetryableFailure({ code: "HTTP_ERROR", statusCode: 503 }), true);
  assert.equal(isRetryableFailure({ code: "HTTP_ERROR", statusCode: 401 }), false);
  assert.equal(retryDelayMs(1), 500);
  assert.equal(retryDelayMs(8), 30_000);
});
