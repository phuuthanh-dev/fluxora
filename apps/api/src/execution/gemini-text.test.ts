import assert from "node:assert/strict";
import { test } from "node:test";
import { executeGeminiText, generateGeminiText, listGeminiTextModels } from "./gemini-text";
import { CredentialProvider } from "@prisma/client";
import { NodeFailure } from "./node-failure";

const input = { apiKey: "test-key", model: "models/example-model", prompt: "A test prompt", timeoutMs: 5000 };

test("Gemini text generation uses a fixed host and returns normalized text", async () => {
  const output = await generateGeminiText(input, async (url, init) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/example-model:generateContent");
    assert.equal((init.headers as Record<string, string>)["x-goog-api-key"], "test-key");
    assert.equal(url.includes(input.apiKey), false);
    return Response.json({ candidates: [{ content: { parts: [{ text: "private thought", thought: true }, { text: "Hello" }, { text: " world" }] }, finishReason: "STOP" }] });
  });
  assert.deepEqual(output, { text: "Hello world", model: "example-model", finishReason: "STOP" });
});

test("Gemini rejects unsafe inputs before the network call", async () => {
  let called = false;
  await assert.rejects(generateGeminiText({ ...input, model: "../other" }, async () => { called = true; return new Response(); }), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT");
  assert.equal(called, false);
});

test("Gemini errors classify retries without leaking provider responses", async () => {
  for (const [status, retryable] of [[400, false], [429, true], [503, true]] as const) {
    await assert.rejects(generateGeminiText(input, async () => new Response("sensitive provider detail", { status })), (error: unknown) => error instanceof NodeFailure && error.retryable === retryable && !error.message.includes("sensitive"));
  }
  await assert.rejects(generateGeminiText(input, async () => Response.json({ promptFeedback: { blockReason: "SAFETY" } })), (error: unknown) => error instanceof NodeFailure && error.code === "EMPTY_RESPONSE");
  await assert.rejects(generateGeminiText(input, async () => Response.json({ candidates: [{ content: { parts: [{ text: "x".repeat(100_001) }] } }] })), (error: unknown) => error instanceof NodeFailure && error.code === "RESPONSE_TOO_LARGE");
});

test("Gemini model discovery returns bounded generation-capable identifiers only", async () => {
  const result = await listGeminiTextModels("test-key", async (url, init) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100");
    assert.equal((init.headers as Record<string, string>)["x-goog-api-key"], "test-key");
    return Response.json({ models: [
      { name: "models/example", displayName: "Example", supportedGenerationMethods: ["generateContent"] },
      { name: "models/embed", supportedGenerationMethods: ["embedContent"] },
      { name: "models/../invalid", supportedGenerationMethods: ["generateContent"] },
    ], nextPageToken: "not-exposed" });
  });
  assert.deepEqual(result, { models: [{ id: "models/example", label: "Example" }], hasMore: true });
});

test("Gemini mock never reads a credential or calls a provider", async () => {
  const credentials = { readForExecution: () => { throw new Error("unexpected credential read"); } } as never;
  const result = await executeGeminiText({ model: "models/example", prompt: "Hello" }, "mock", "workspace-1", credentials, async () => { throw new Error("unexpected provider call"); });
  assert.equal(result.output.text, "Mock Gemini response");
  assert.equal(result.output.model, "example");
});

test("Gemini live uses workspace-scoped credential and does not return its key", async () => {
  const credentials = { readForExecution: async (id: string, workspace: string, provider: CredentialProvider) => {
    assert.deepEqual([id, workspace, provider], ["credential-1", "workspace-1", CredentialProvider.GEMINI]);
    return { apiKey: "synthetic-secret" };
  } } as never;
  const result = await executeGeminiText({ credentialId: "credential-1", model: "models/example", prompt: "Hello", maxOutputTokens: 100, timeoutMs: 5000 }, "live", "workspace-1", credentials, async (value) => {
    assert.equal(value.apiKey, "synthetic-secret");
    assert.equal(value.maxOutputTokens, 100);
    return { text: "Answer", model: "example", finishReason: "STOP" };
  });
  assert.equal(result.output.text, "Answer");
  assert.equal(JSON.stringify(result).includes("synthetic-secret"), false);
  await assert.rejects(executeGeminiText({ model: "example", prompt: "Hello" }, "live", "workspace-1", credentials), (error: unknown) => error instanceof NodeFailure && error.code === "CREDENTIAL_REQUIRED");
});
