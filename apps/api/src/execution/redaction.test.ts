import assert from "node:assert/strict";
import test from "node:test";
import { markPageTokenOutput, redactValue } from "./redaction";
import { normalizeAiUsage } from "./ai-structured-output";
import { driveListOutput } from "./google-drive-pagination";

test("only nonnegative integer usage counters survive token redaction", () => {
  const result = redactValue({
    text: "answer", model: "example", finishReason: "completed",
    usage: Object.assign(normalizeAiUsage({ a: 3, b: 4, c: 15, d: 8 }, { input: "a", output: "b", total: "c", thoughts: "d" })!, { token: 123456, apiToken: "secret", accessToken: "secret", otherTokens: 123456 }),
    token: "secret", inputTokens: "secret", nested: { usage: { inputTokens: "secret", outputTokens: -1, totalTokens: 1.5, thoughtsTokens: Number.MAX_SAFE_INTEGER + 1, token: "secret" } },
    array: [{ usage: { inputTokens: 0, accessToken: "secret" } }],
  });
  assert.deepEqual(result, {
    text: "answer", model: "example", finishReason: "completed",
    usage: { inputTokens: 3, outputTokens: 4, totalTokens: 15, thoughtsTokens: 8, token: "[REDACTED]", apiToken: "[REDACTED]", accessToken: "[REDACTED]", otherTokens: "[REDACTED]" },
    token: "[REDACTED]", inputTokens: "[REDACTED]", nested: { usage: { inputTokens: "[REDACTED]", outputTokens: "[REDACTED]", totalTokens: "[REDACTED]", thoughtsTokens: "[REDACTED]", token: "[REDACTED]" } },
    array: [{ usage: { inputTokens: "[REDACTED]", accessToken: "[REDACTED]" } }],
  });
  assert.deepEqual(redactValue({ usage: { inputTokens: 123456 } }), { usage: { inputTokens: "[REDACTED]" } });
  assert.deepEqual(redactValue({ text: "spoof", model: "example", finishReason: "completed", usage: { inputTokens: 123456, accessToken: "secret" } }), { text: "spoof", model: "example", finishReason: "completed", usage: { inputTokens: "[REDACTED]", accessToken: "[REDACTED]" } });
});

test("only adapter-marked top-level continuation tokens survive redaction", () => {
  const output = markPageTokenOutput({ nextPageToken: "page-2", accessToken: "secret", items: [{ nextPageToken: "nested-secret", apiToken: "secret" }] });
  assert.deepEqual(redactValue(output), { nextPageToken: "page-2", accessToken: "[REDACTED]", items: [{ nextPageToken: "[REDACTED]", apiToken: "[REDACTED]" }] });
  assert.deepEqual(redactValue({ nextPageToken: "untrusted" }), { nextPageToken: "[REDACTED]" });
  assert.throws(() => driveListOutput("list", { files: [], nextPageToken: "cursor-synthetic-secret" }, "synthetic-secret"), /invalid file list or continuation token/);
});
