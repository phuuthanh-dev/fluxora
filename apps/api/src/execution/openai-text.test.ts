import assert from "node:assert/strict";
import test from "node:test";
import { CredentialProvider } from "@prisma/client";
import { executeOpenAIText, generateOpenAIText, listOpenAIModels } from "./openai-text";
import { NodeFailure } from "./node-failure";

const input = { apiKey: "synthetic-key", model: "example", prompt: "Hello", maxOutputTokens: 100, timeoutMs: 5000 };

test("OpenAI Responses request disables storage and extracts only assistant text", async () => {
  const result = await generateOpenAIText(input, async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal((init.headers as Record<string, string>).Authorization, "Bearer synthetic-key");
    assert.deepEqual(JSON.parse(String(init.body)), { model: "example", input: "Hello", max_output_tokens: 100, store: false });
    return Response.json({ status: "completed", output: [
      { type: "reasoning", summary: [{ text: "private reasoning" }] },
      { type: "message", role: "assistant", content: [{ type: "output_text", text: "Hello" }, { type: "output_text", text: " world" }] },
    ] });
  });
  assert.deepEqual(result, { text: "Hello world", model: "example", finishReason: "completed" });
});

test("OpenAI sanitizes failures and classifies refusal and incomplete responses", async () => {
  for (const [status, retryable] of [[401, false], [429, true], [503, true]] as const) {
    await assert.rejects(generateOpenAIText(input, async () => new Response("provider-secret", { status })), (error: unknown) => error instanceof NodeFailure && error.retryable === retryable && !error.message.includes("provider-secret"));
  }
  await assert.rejects(generateOpenAIText(input, async () => Response.json({ status: "incomplete", output: [] })), (error: unknown) => error instanceof NodeFailure && error.code === "INCOMPLETE_RESPONSE");
  await assert.rejects(generateOpenAIText(input, async () => Response.json({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "refusal", refusal: "sensitive" }] }] })), (error: unknown) => error instanceof NodeFailure && error.code === "PROVIDER_REFUSAL" && !error.message.includes("sensitive"));
});

test("OpenAI model listing is bounded and uses connection header", async () => {
  const result = await listOpenAIModels("synthetic-key", async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/models");
    assert.equal((init.headers as Record<string, string>).Authorization, "Bearer synthetic-key");
    return Response.json({ data: Array.from({ length: 105 }, (_, index) => ({ id: `model-${index}` })) });
  });
  assert.equal(result.models.length, 100);
  assert.equal(result.hasMore, true);
});

test("OpenAI mock avoids credentials, live reads only its workspace connection", async () => {
  const calls: unknown[][] = [];
  const credentials = { readForExecution: async (...args: unknown[]) => { calls.push(args); return { apiKey: "synthetic-key" }; } } as never;
  await executeOpenAIText({ model: "example", prompt: "Hello" }, "mock", "ws-1", credentials);
  assert.equal(calls.length, 0);
  const result = await executeOpenAIText({ credentialId: "cred-1", model: "example", prompt: "Hello" }, "live", "ws-1", credentials, async () => ({ text: "result", model: "example", finishReason: "completed" }));
  assert.deepEqual(calls[0], ["cred-1", "ws-1", CredentialProvider.OPENAI]);
  assert.equal(JSON.stringify(result).includes("synthetic-key"), false);
});
