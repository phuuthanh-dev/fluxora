import assert from "node:assert/strict";
import test from "node:test";
import { CredentialProvider } from "@prisma/client";
import { executeOpenAIText, generateOpenAIText, listOpenAIModels } from "./openai-text";
import { NodeFailure } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";

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
  for (const [status, retryable] of [[401, false], [429, false], [503, false]] as const) {
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

test("OpenAI discovery omits identifiers containing the connection key", async () => {
  const result = await listOpenAIModels("synthetic-key", async () => Response.json({ data: [{ id: "synthetic-key" }, { id: "valid-model" }] }));
  assert.deepEqual(result.models, [{ id: "valid-model", label: "valid-model" }]);
  assert.equal(JSON.stringify(result).includes("synthetic-key"), false);
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

const structuredSchema = { type: "object" as const, properties: { answer: { type: "string" as const } }, required: ["answer"], additionalProperties: false as const };

test("OpenAI structured generation requests a strict schema and normalizes usage", async () => {
  const result = await generateOpenAIText({ ...input, outputSchema: structuredSchema }, async (_url, init) => {
    const body = JSON.parse(String(init.body));
    assert.equal(body.store, false);
    assert.deepEqual(body.text, { format: { type: "json_schema", name: "fluxora_output", strict: true, schema: structuredSchema } });
    return Response.json({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: '{"answer":"yes"}' }] }], usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 } });
  });
  assert.deepEqual(result, { text: '{"answer":"yes"}', json: { answer: "yes" }, model: "example", finishReason: "completed", usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 } });
});

test("OpenAI structured output rejects mismatch and refusal even when text is present", async () => {
  for (const [content, code] of [[[{ type: "output_text", text: '{"answer":1,"private":true}' }], "INVALID_STRUCTURED_OUTPUT"], [[{ type: "output_text", text: '{"answer":"yes"}' }, { type: "refusal", refusal: "private" }], "PROVIDER_REFUSAL"]] as const) {
    await assert.rejects(generateOpenAIText({ ...input, outputSchema: structuredSchema }, async () => Response.json({ status: "completed", output: [{ type: "message", role: "assistant", content }] })), (error: unknown) => error instanceof NodeFailure && error.code === code && !error.retryable && !error.message.includes("private"));
  }
});

test("OpenAI structured mock validates schema before credential access", async () => {
  const credentials = { readForExecution: () => { throw new Error("unexpected credential read"); } } as never;
  const result = await executeOpenAIText({ model: "example", prompt: "Hello", outputSchema: structuredSchema }, "mock", "ws", credentials);
  assert.deepEqual(result.output.json, { answer: "" });
  await assert.rejects(executeOpenAIText({ model: "example", prompt: "Hello", outputSchema: { type: "object" } }, "live", "ws", credentials), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT");
});

test("OpenAI rejects invalid schemas before transport and bounds structured text", async () => {
  let called = false;
  await assert.rejects(generateOpenAIText({ ...input, outputSchema: { type: "object" } }, async () => { called = true; return new Response(); }), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT" && !error.retryable);
  assert.equal(called, false);
  await assert.rejects(generateOpenAIText({ ...input, outputSchema: structuredSchema }, async () => Response.json({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: 'x'.repeat(100_001) }] }] })), (error: unknown) => error instanceof NodeFailure && error.code === "RESPONSE_TOO_LARGE" && !error.retryable);
});

test("OpenAI passes structured configuration to the workspace-scoped live adapter", async () => {
  const credentials = { readForExecution: async () => ({ apiKey: "synthetic-key" }) } as never;
  const result = await executeOpenAIText({ model: "example", prompt: "Hello", credentialId: "cred", outputSchema: structuredSchema }, "live", "ws", credentials, async (request) => {
    assert.deepEqual(request.outputSchema, structuredSchema);
    return { text: '{"answer":"ok"}', json: { answer: "ok" }, model: "example", finishReason: "completed" };
  });
  assert.deepEqual(result.output.json, { answer: "ok" });
});

test("OpenAI delegates model capability decisions to the provider", async () => {
  const credentials = { readForExecution: () => { throw new Error("unexpected credential read"); } } as never;
  await assert.rejects(executeOpenAIText({ model: "example", prompt: "Hello", outputSchema: undefined }, "live", "ws", credentials), (error: unknown) => error instanceof NodeFailure && error.code === "INVALID_INPUT");
  let calls = 0;
  await assert.rejects(generateOpenAIText({ ...input, model: "gpt-4-turbo", outputSchema: structuredSchema }, async () => { calls += 1; return new Response("provider details", { status: 400 }); }), (error: unknown) => error instanceof NodeFailure && error.code === "HTTP_ERROR" && !error.retryable && !error.message.includes("provider details"));
  assert.equal(calls, 1);
  assert.equal((await executeOpenAIText({ model: "unknown-custom-model", prompt: "Hello", outputSchema: structuredSchema }, "mock", "ws", credentials)).output.model, "unknown-custom-model");
});

test("OpenAI preserves schema descriptions in its request", async () => {
  const described = { ...structuredSchema, description: "Root", properties: { answer: { type: "string" as const, description: "" } } };
  await generateOpenAIText({ ...input, outputSchema: described }, async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init.body)).text.format.schema, described);
    return Response.json({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: '{"answer":"ok"}' }] }] });
  });
});

test("OpenAI generation does not retry ambiguous failures", async () => {
  for (const error of [new Error("private"), Object.assign(new Error("private"), { name: "TimeoutError" })]) {
    await assert.rejects(generateOpenAIText(input, async () => { throw error; }), (failure: unknown) => failure instanceof NodeFailure && !failure.retryable && !failure.message.includes("private"));
  }
  let calls = 0;
  const redirected = (url: string, init: RequestInit) => fetchSafeOutbound(url, init, {
    resolveHost: async () => ["93.184.216.34"],
    fetchImplementation: async () => ++calls === 1 ? new Response(null, { status: 302, headers: { location: "/retry" } }) : new Response(null, { status: 429 }),
  });
  await assert.rejects(generateOpenAIText(input, redirected), (error: unknown) => error instanceof NodeFailure && error.statusCode === 429 && !error.retryable);
  assert.equal(calls, 2);
});
