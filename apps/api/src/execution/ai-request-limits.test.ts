import assert from "node:assert/strict";
import test from "node:test";
import { aiOutputTokenCeiling, aiPromptCharacterCeiling } from "./ai-request-limits";
import { generateGeminiText, executeGeminiText } from "./gemini-text";
import { generateOpenAIText, executeOpenAIText } from "./openai-text";
import { NodeFailure } from "./node-failure";

test("operator ceiling is bounded and invalid settings fail closed", () => {
  assert.equal(aiOutputTokenCeiling("256"), 256);
  for (const setting of ["", "0", "8193", "1.5", "-1", " 12", "NaN"]) {
    assert.throws(() => aiOutputTokenCeiling(setting), (error: unknown) => error instanceof NodeFailure && error.code === "AI_LIMIT_CONFIG_INVALID" && !error.retryable);
  }
});

test("operator prompt ceiling is bounded and invalid settings fail closed", () => {
  assert.equal(aiPromptCharacterCeiling("256"), 256);
  for (const setting of ["", "0", "100001", "1.5", "-1", " 12", "NaN"]) {
    assert.throws(() => aiPromptCharacterCeiling(setting), (error: unknown) => error instanceof NodeFailure && error.code === "AI_LIMIT_CONFIG_INVALID" && !error.retryable);
  }
});

test("cleared and zero AI output limits fail before credential access", async () => {
  const credentials = { readForExecution: () => { throw new Error("unexpected credential access"); } } as never;
  for (const maxOutputTokens of ["", 0]) {
    for (const run of [executeGeminiText, executeOpenAIText]) {
      await assert.rejects(run({ model: "example", prompt: "Hello", credentialId: "synthetic", maxOutputTokens }, "live", "ws", credentials), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT" && !error.retryable);
    }
  }
});

test("prompt ceiling applies before credential access or transport without truncating", async () => {
  const previous = process.env.AI_MAX_PROMPT_CHARACTERS;
  process.env.AI_MAX_PROMPT_CHARACTERS = "4";
  const credentials = { readForExecution: () => { throw new Error("unexpected credential access"); } } as never;
  let transports = 0;
  const transport = async () => { transports += 1; return new Response(); };
  const invalid = (error: unknown) => error instanceof NodeFailure && error.code === "AI_PROMPT_LIMIT_EXCEEDED" && !error.retryable;
  try {
    await assert.rejects(executeGeminiText({ model: "example", prompt: "hello" }, "live", "ws", credentials), invalid);
    await assert.rejects(executeOpenAIText({ model: "example", prompt: "hello" }, "live", "ws", credentials), invalid);
    await assert.rejects(generateGeminiText({ model: "example", apiKey: "synthetic", prompt: "hello", timeoutMs: 5000 }, transport), invalid);
    await assert.rejects(generateOpenAIText({ model: "example", apiKey: "synthetic", prompt: "hello", maxOutputTokens: 100, timeoutMs: 5000 }, transport), invalid);
    assert.equal(transports, 0);
    assert.equal((await executeGeminiText({ model: "example", prompt: "🙂🙂" }, "mock", "ws", credentials)).status, "succeeded");
    assert.equal((await executeOpenAIText({ model: "example", prompt: "🙂🙂" }, "mock", "ws", credentials)).status, "succeeded");
  } finally {
    if (previous === undefined) delete process.env.AI_MAX_PROMPT_CHARACTERS;
    else process.env.AI_MAX_PROMPT_CHARACTERS = previous;
  }
});

test("node and direct generation enforce the operator limit before credentials or transport", async () => {
  const previous = process.env.AI_MAX_OUTPUT_TOKENS;
  process.env.AI_MAX_OUTPUT_TOKENS = "100";
  const credentials = { readForExecution: () => { throw new Error("unexpected credential access"); } } as never;
  let transports = 0;
  const transport = async () => { transports += 1; return new Response(); };
  const invalid = (error: unknown) => error instanceof NodeFailure && error.code === "AI_OUTPUT_LIMIT_EXCEEDED" && !error.retryable;
  try {
    await assert.rejects(executeGeminiText({ model: "example", prompt: "Hello", maxOutputTokens: 101 }, "live", "ws", credentials), invalid);
    await assert.rejects(executeOpenAIText({ model: "example", prompt: "Hello", maxOutputTokens: 101 }, "live", "ws", credentials), invalid);
    await assert.rejects(generateGeminiText({ model: "example", apiKey: "synthetic", prompt: "Hello", timeoutMs: 5000 }, transport), invalid);
    await assert.rejects(generateOpenAIText({ model: "example", apiKey: "synthetic", prompt: "Hello", maxOutputTokens: 101, timeoutMs: 5000 }, transport), invalid);
    assert.equal(transports, 0);
    assert.equal((await executeGeminiText({ model: "example", prompt: "Hello", maxOutputTokens: 100 }, "mock", "ws", credentials)).status, "succeeded");
    assert.equal((await executeOpenAIText({ model: "example", prompt: "Hello", maxOutputTokens: 100 }, "mock", "ws", credentials)).status, "succeeded");
  } finally {
    if (previous === undefined) delete process.env.AI_MAX_OUTPUT_TOKENS;
    else process.env.AI_MAX_OUTPUT_TOKENS = previous;
  }
});

test("generation blocks redirect replay and marks failure terminal", async () => {
  const { fetchSafeOutbound } = await import("./outbound-url-policy");
  let calls = 0;
  const transport = (url: string, init: RequestInit) => fetchSafeOutbound(url, init, {
    rejectWriteRedirects: true,
    resolveHost: async () => ["93.184.216.34"],
    fetchImplementation: async () => { calls += 1; return new Response(null, { status: 307, headers: { location: "/again" } }); },
  });
  await assert.rejects(generateGeminiText({ model: "example", apiKey: "synthetic", prompt: "Hello", maxOutputTokens: 100, timeoutMs: 5000 }, transport), (error: unknown) => error instanceof NodeFailure && !error.retryable);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(generateOpenAIText({ model: "example", apiKey: "synthetic", prompt: "Hello", maxOutputTokens: 100, timeoutMs: 5000 }, transport), (error: unknown) => error instanceof NodeFailure && !error.retryable);
  assert.equal(calls, 1);
});
