import assert from "node:assert/strict";
import test from "node:test";
import { executeGeminiText, generateGeminiText, listGeminiTextModels } from "./gemini-text";
import { executeOpenAIText, generateOpenAIText, listOpenAIModels } from "./openai-text";
import { NodeFailure } from "./node-failure";
import { resolveExpressions } from "./expression";

test("unresolved AI limits fail before the vault or a paid request, while omitted limits retain legacy defaults", async () => {
  const credentials = { readForExecution: () => { throw new Error("unexpected credential access"); } } as never;
  for (const execute of [executeGeminiText, executeOpenAIText]) {
    for (const field of ["maxOutputTokens", "timeoutMs"]) {
      const config = resolveExpressions({ credentialId: "credential", model: "example", prompt: "Hello", [field]: "{{missing.value}}" }, {}) as Record<string, unknown>;
      for (const mode of ["mock", "live"] as const) {
        await assert.rejects(() => execute(config, mode, "workspace", credentials), (e: unknown) => e instanceof NodeFailure && e.code === "INVALID_INPUT" && !e.retryable);
      }
    }
    const result = await execute({ model: "example", prompt: "Hello" }, "mock", "workspace", credentials);
    assert.equal(result.status, "succeeded");
  }
});

test("AI provider error bodies are released without exposing them or retrying paid generation", async () => {
  let canceled = 0;
  const failure = async () => new Response(new ReadableStream({ cancel() { canceled++; } }), { status: 429 });
  const generateInput = { apiKey: "synthetic-key", model: "example", prompt: "Hello", maxOutputTokens: 20, timeoutMs: 5000 };
  for (const generate of [generateGeminiText, generateOpenAIText]) {
    await assert.rejects(() => generate(generateInput, failure), (e: unknown) => e instanceof NodeFailure && e.code === "HTTP_ERROR" && !e.retryable && !e.message.includes("synthetic-key"));
  }
  for (const list of [listGeminiTextModels, listOpenAIModels]) {
    await assert.rejects(() => list("synthetic-key", failure), (e: unknown) => e instanceof NodeFailure && e.code === "HTTP_ERROR" && e.retryable);
  }
  assert.equal(canceled, 4);
});

test("both AI providers fail closed on structured numeric precision loss", async () => {
  const outputSchema = { type: "object" as const, properties: { amount: { type: "number" as const } }, required: ["amount"], additionalProperties: false as const };
  const input = { apiKey: "synthetic-key", model: "example", prompt: "Hello", maxOutputTokens: 20, timeoutMs: 5000, outputSchema };
  const text = '{"amount":0.10000000000000001}';
  for (const [generate, response] of [
    [generateGeminiText, { candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }] }],
    [generateOpenAIText, { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }] }],
  ] as const) {
    let calls = 0;
    await assert.rejects(() => generate(input, async () => { calls++; return Response.json(response); }), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_STRUCTURED_OUTPUT" && !error.retryable && !error.message.includes(text));
    assert.equal(calls, 1);
  }
});
