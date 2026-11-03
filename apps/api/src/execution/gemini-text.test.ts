import assert from "node:assert/strict";
import { test } from "node:test";
import { executeGeminiText, generateGeminiText, listGeminiTextModels } from "./gemini-text";
import { CredentialProvider } from "@prisma/client";
import { NodeFailure } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";

const input = { apiKey: "test-key", model: "models/example-model", prompt: "A test prompt", timeoutMs: 5000 };

test("Gemini text generation uses a fixed host and returns normalized text", async () => {
  const output = await generateGeminiText(input, async (url, init) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/example-model:generateContent");
    assert.equal((init.headers as Record<string, string>)["x-goog-api-key"], "test-key");
    assert.equal(url.includes(input.apiKey), false);
    assert.equal(JSON.parse(String(init.body)).generationConfig.maxOutputTokens, 1024);
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
  for (const [status, retryable] of [[400, false], [429, false], [503, false]] as const) {
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
      { name: "models/example", displayName: "Example", supportedGenerationMethods: ["generateContent"], inputTokenLimit: 1000000, outputTokenLimit: 8192, thinking: true },
      { name: "models/embed", supportedGenerationMethods: ["embedContent"] },
      { name: "models/../invalid", supportedGenerationMethods: ["generateContent"] },
    ], nextPageToken: "not-exposed" });
  });
  assert.deepEqual(result, { models: [{ id: "models/example", label: "Example", inputTokenLimit: 1000000, outputTokenLimit: 8192, thinking: true }], hasMore: true, nextPageToken: "not-exposed" });
});

test("Gemini discovery omits invalid or missing provider limits rather than guessing", async () => {
  const result = await listGeminiTextModels("test-key", async () => Response.json({ models: [
    { name: "models/a", supportedGenerationMethods: ["generateContent"], inputTokenLimit: -1, outputTokenLimit: "8192", thinking: "true" },
    { name: "models/b", supportedGenerationMethods: ["generateContent"], inputTokenLimit: 1024, outputTokenLimit: 0, thinking: false },
  ] }));
  assert.deepEqual(result.models, [{ id: "models/a", label: "models/a" }, { id: "models/b", label: "models/b", inputTokenLimit: 1024, thinking: false }]);
});

test("Gemini discovery sends the continuation safely and never exposes an unsafe or repeated token", async () => {
  const transport = async (url: string) => {
    const request = new URL(url);
    assert.equal(request.searchParams.get("pageSize"), "100");
    assert.equal(request.searchParams.get("pageToken"), "next+/=");
    return Response.json({ models: [{ name: "models/second", supportedGenerationMethods: ["generateContent"] }] });
  };
  const result = await listGeminiTextModels("synthetic-key", transport, "next+/=");
  assert.deepEqual(result, { models: [{ id: "models/second", label: "models/second" }], hasMore: false, nextPageToken: null });
  for (const token of ["synthetic-key", "prefix-synthetic-key-suffix", "invalid\nvalue", "next+/="]) {
    const unsafe = await listGeminiTextModels("synthetic-key", async () => Response.json({ models: [], nextPageToken: token }), "next+/=");
    assert.equal(unsafe.nextPageToken, null);
    assert.equal(unsafe.hasMore, true);
    assert.ok(unsafe.warning);
    assert.equal(JSON.stringify(unsafe).includes("synthetic-key"), false);
  }
  await assert.rejects(listGeminiTextModels("synthetic-key", async () => { throw new Error("unexpected provider request"); }, "synthetic-key"), /Invalid Gemini model page token/);
});

test("Gemini discovery does not expose a connection key echoed by provider metadata", async () => {
  const result = await listGeminiTextModels("synthetic-key", async () => Response.json({ models: [
    { name: "models/synthetic-key", displayName: "Example", supportedGenerationMethods: ["generateContent"] },
    { name: "models/valid", displayName: "prefix synthetic-key suffix", supportedGenerationMethods: ["generateContent"] },
  ] }));
  assert.deepEqual(result.models, [{ id: "models/valid", label: "prefix  suffix" }]);
  assert.equal(JSON.stringify(result).includes("synthetic-key"), false);
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

const structuredSchema = { type: "object" as const, properties: { answer: { type: "string" as const } }, required: ["answer"], additionalProperties: false as const };

test("Gemini rejects credential echoes in text, decoded JSON and finish reason", async () => {
  const apiKey = 'synthetic"key';
  for (const kind of ["text", "json", "finishReason"]) {
    const text = kind === "json" ? JSON.stringify({ answer: `prefix ${apiKey} suffix` }) : kind === "text" ? `prefix ${apiKey} suffix` : "ordinary answer";
    const finishReason = kind === "finishReason" ? apiKey : "STOP";
    await assert.rejects(generateGeminiText({ ...input, apiKey, ...(kind === "json" ? { outputSchema: structuredSchema } : {}) }, async () => Response.json({ candidates: [{ content: { parts: [{ text }] }, finishReason }] })), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_RESPONSE" && !error.retryable && !error.message.includes(apiKey));
  }
});

test("Gemini structured generation requests JSON, validates it and normalizes usage", async () => {
  const output = await generateGeminiText({ ...input, maxOutputTokens: 100, outputSchema: structuredSchema }, async (_url, init) => {
    const body = JSON.parse(String(init.body));
    assert.deepEqual(body.generationConfig, { maxOutputTokens: 100, responseMimeType: "application/json", responseJsonSchema: structuredSchema });
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"answer":"yes"}' }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4, totalTokenCount: 7, secret: "not included" } });
  });
  assert.deepEqual(output, { text: '{"answer":"yes"}', json: { answer: "yes" }, model: "example-model", finishReason: "STOP", usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 } });
});

test("Gemini structured failures are non-retryable and do not leak response content", async () => {
  for (const [text, finishReason, code] of [['{"answer":1,"private":true}', "STOP", "INVALID_STRUCTURED_OUTPUT"], ['{"answer":"private"}', "MAX_TOKENS", "INCOMPLETE_RESPONSE"], ["private", "STOP", "INVALID_STRUCTURED_OUTPUT"]]) {
    await assert.rejects(generateGeminiText({ ...input, outputSchema: structuredSchema }, async () => Response.json({ candidates: [{ content: { parts: [{ text }] }, finishReason }] })), (error: unknown) => error instanceof NodeFailure && error.code === code && !error.retryable && !error.message.includes("private"));
  }
});

test("Gemini structured mock validates schema before credential access", async () => {
  const credentials = { readForExecution: () => { throw new Error("unexpected credential read"); } } as never;
  const result = await executeGeminiText({ model: "example", prompt: "Hello", outputSchema: structuredSchema }, "mock", "ws", credentials);
  assert.deepEqual(result.output.json, { answer: "" });
  await assert.rejects(executeGeminiText({ model: "example", prompt: "Hello", outputSchema: { type: "object" } }, "live", "ws", credentials), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT");
});

test("Gemini passes structured configuration to the live adapter and validates before transport", async () => {
  let called = false;
  await assert.rejects(generateGeminiText({ ...input, outputSchema: { type: "object" } }, async () => { called = true; return new Response(); }), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT" && !error.retryable);
  assert.equal(called, false);
  const credentials = { readForExecution: async () => ({ apiKey: "synthetic-key" }) } as never;
  const result = await executeGeminiText({ model: "example", prompt: "Hello", credentialId: "cred", outputSchema: structuredSchema }, "live", "ws", credentials, async (request) => {
    assert.deepEqual(request.outputSchema, structuredSchema);
    return { text: '{"answer":"ok"}', json: { answer: "ok" }, model: "example", finishReason: "STOP" };
  });
  assert.deepEqual(result.output.json, { answer: "ok" });
});

test("Gemini rejects unresolved schemas and known incompatible models before credential access", async () => {
  const credentials = { readForExecution: () => { throw new Error("unexpected credential read"); } } as never;
  for (const config of [
    { model: "example", outputSchema: undefined },
    { model: "models/gemini-2.0-flash", outputSchema: structuredSchema },
  ]) {
    await assert.rejects(executeGeminiText({ ...config, prompt: "Hello", credentialId: "cred" }, "live", "ws", credentials), (error: unknown) => error instanceof NodeFailure && !error.retryable && ["INVALID_INPUT", "UNSUPPORTED_MODEL"].includes(error.code));
  }
  await assert.rejects(generateGeminiText({ ...input, model: "gemini-2.0-flash", outputSchema: structuredSchema }, async () => { throw new Error("unexpected transport"); }), (error: unknown) => error instanceof NodeFailure && error.code === "UNSUPPORTED_MODEL");
  assert.equal((await executeGeminiText({ model: "gemini-2.0-flash", prompt: "Hello" }, "mock", "ws", credentials)).output.text, "Mock Gemini response");
});

test("Gemini preserves descriptions and reports thinking tokens separately", async () => {
  const described = { ...structuredSchema, description: "Root", properties: { answer: { type: "string" as const, description: "" } } };
  const output = await generateGeminiText({ ...input, outputSchema: described }, async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init.body)).generationConfig.responseJsonSchema, described);
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"answer":"ok"}' }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4, thoughtsTokenCount: 8, totalTokenCount: 15 } });
  });
  assert.deepEqual(output.usage, { inputTokens: 3, outputTokens: 4, thoughtsTokens: 8, totalTokens: 15 });
});

test("Gemini generation does not retry ambiguous failures", async () => {
  for (const error of [new Error("private"), Object.assign(new Error("private"), { name: "TimeoutError" })]) {
    await assert.rejects(generateGeminiText(input, async () => { throw error; }), (failure: unknown) => failure instanceof NodeFailure && !failure.retryable && !failure.message.includes("private"));
  }
  let calls = 0;
  const redirected = (url: string, init: RequestInit) => fetchSafeOutbound(url, init, {
    resolveHost: async () => ["93.184.216.34"],
    fetchImplementation: async () => ++calls === 1 ? new Response(null, { status: 302, headers: { location: "/retry" } }) : new Response(null, { status: 429 }),
  });
  await assert.rejects(generateGeminiText(input, redirected), (error: unknown) => error instanceof NodeFailure && error.statusCode === 429 && !error.retryable);
  assert.equal(calls, 2);
});


test("Gemini delegates unrecognized structured models to the provider", async () => {
  let calls = 0;
  await assert.rejects(generateGeminiText({ ...input, model: "gemini-future-custom", outputSchema: structuredSchema }, async () => {
    calls += 1;
    return new Response("private provider details", { status: 400 });
  }), (error: unknown) => error instanceof NodeFailure && error.code === "HTTP_ERROR" && !error.retryable && !error.message.includes("private"));
  assert.equal(calls, 1);
});
