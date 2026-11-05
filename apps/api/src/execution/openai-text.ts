import { CredentialProvider } from "@prisma/client";
import { nodeConfigIssues } from "@workflow/contracts";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound, fetchSafeOutboundWrite } from "./outbound-url-policy";
import { readBoundedProviderJson } from "./provider-json";
import { assertNoAiCredentialEcho, mockAiOutput, normalizeAiUsage, parseAiOutput, parseAiSchema } from "./ai-structured-output";
import type { AiSchema } from "./ai-structured-output";
import { assertAiRequestLimits, assertResolvedAiLimits } from "./ai-request-limits";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
type OpenAIInput = { apiKey: string; model: string; prompt: string; maxOutputTokens: number; timeoutMs: number; outputSchema?: AiSchema };

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

async function request(url: string, init: RequestInit, transport: Transport, paidGeneration = false, structured = false): Promise<unknown> {
  let response: Response;
  try { response = await transport(url, init); } catch (reason) {
    const failure = nodeFailureFromOutboundPolicy(reason);
    throw paidGeneration ? new NodeFailure(failure.code, failure.message, false, failure.statusCode) : failure;
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new NodeFailure("HTTP_ERROR", response.status === 400 && structured ? "OpenAI rejected the structured output request; check model and schema support." : `OpenAI returned ${response.status}.`, paidGeneration ? false : response.status === 429 || response.status >= 500, response.status);
  }
  try { return await readBoundedProviderJson(response); } catch (reason) {
    if (reason instanceof NodeFailure) throw paidGeneration ? new NodeFailure(reason.code, reason.message, false, reason.statusCode) : reason;
    throw new NodeFailure("INVALID_RESPONSE", "OpenAI returned an invalid response.", false);
  }
}

export async function listOpenAIModels(apiKey: string, transport: Transport = fetchSafeOutbound) {
  if (!apiKey.trim()) throw new NodeFailure("INVALID_INPUT", "OpenAI API key is required.", false);
  const root = record(await request("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10_000) }, transport));
  if (!root || !Array.isArray(root.data)) throw new NodeFailure("INVALID_RESPONSE", "OpenAI returned an invalid model list.", false);
  const valid = root.data.flatMap((item) => {
    const model = record(item);
    return typeof model?.id === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(model.id) && !model.id.includes(apiKey) ? [{ id: model.id, label: model.id }] : [];
  });
  return { models: valid.slice(0, 100), hasMore: valid.length > 100 };
}

export async function generateOpenAIText(input: OpenAIInput, transport: Transport = fetchSafeOutboundWrite) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(input.model) || !input.apiKey.trim() || !Number.isInteger(input.timeoutMs) || input.timeoutMs < 1000 || input.timeoutMs > 120_000) throw new NodeFailure("INVALID_INPUT", "OpenAI model, API key or timeout is invalid.", false);
  assertAiRequestLimits(input.prompt, input.maxOutputTokens);
  const outputSchema = parseAiSchema(input.outputSchema);
  const root = record(await request("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${input.apiKey}` },
    body: JSON.stringify({ model: input.model, input: input.prompt, max_output_tokens: input.maxOutputTokens, store: false, ...(outputSchema ? { text: { format: { type: "json_schema", name: "fluxora_output", strict: true, schema: outputSchema } } } : {}) }),
    signal: AbortSignal.timeout(input.timeoutMs),
  }, transport, true, !!outputSchema));
  if (root?.status !== "completed") throw new NodeFailure("INCOMPLETE_RESPONSE", "OpenAI did not complete the response.", false);
  const messages = Array.isArray(root.output) ? root.output : [];
  let refused = false;
  const text = messages.flatMap((item) => {
    const message = record(item);
    if (message?.type !== "message" || message.role !== "assistant" || !Array.isArray(message.content)) return [];
    return message.content.flatMap((part) => {
      const entry = record(part);
      if (entry?.type === "refusal") refused = true;
      return entry?.type === "output_text" && typeof entry.text === "string" ? [entry.text] : [];
    });
  }).join("");
  // A response can contain both text and a refusal. Do not silently pass
  // partial text downstream as a successful response in either output mode.
  if (refused) throw new NodeFailure("PROVIDER_REFUSAL", "OpenAI declined the request.", false);
  if (!text) throw new NodeFailure("EMPTY_RESPONSE", "OpenAI returned no text.", false);
  if (text.length > 100_000) throw new NodeFailure("RESPONSE_TOO_LARGE", "OpenAI returned too much text.", false);
  const json = outputSchema ? parseAiOutput(text, outputSchema) : undefined;
  assertNoAiCredentialEcho([text, json, input.model], input.apiKey);
  const usage = normalizeAiUsage(root.usage, { input: "input_tokens", output: "output_tokens", total: "total_tokens" });
  return { text, model: input.model, finishReason: "completed", ...(outputSchema ? { json } : {}), ...(usage ? { usage } : {}) };
}

export async function executeOpenAIText(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, generate: typeof generateOpenAIText = generateOpenAIText) {
  const issue = nodeConfigIssues("action.openai", config, "resolved")[0];
  if (issue) throw new NodeFailure("INVALID_INPUT", issue.message, false);
  assertResolvedAiLimits(config);
  const model = typeof config.model === "string" ? config.model : "";
  const prompt = typeof config.prompt === "string" ? config.prompt : "";
  const maxOutputTokens = config.maxOutputTokens === undefined ? 1024 : config.maxOutputTokens;
  const timeoutMs = config.timeoutMs === undefined ? 30_000 : config.timeoutMs;
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(model) || !prompt.trim() || prompt.length > 100_000 ||
      typeof maxOutputTokens !== "number" || !Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 8192 ||
      typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120_000) {
    throw new NodeFailure("INVALID_INPUT", "OpenAI model, prompt, output limit or timeout is invalid.", false);
  }
  if (Object.hasOwn(config, "outputSchema") && config.outputSchema === undefined) throw new NodeFailure("INVALID_INPUT", "Structured output schema is missing.", false);
  const outputSchema = parseAiSchema(config.outputSchema);
  assertAiRequestLimits(prompt, maxOutputTokens);
  if (mode === "mock") {
    const json = outputSchema ? mockAiOutput(outputSchema) : undefined;
    return { status: "succeeded" as const, output: { text: outputSchema ? JSON.stringify(json)! : "Mock OpenAI response", model, finishReason: "completed", ...(outputSchema ? { json } : {}) }, route: "success" as const };
  }
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select an OpenAI connection.", false);
  const credential = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.OPENAI);
  const apiKey = typeof credential.apiKey === "string" ? credential.apiKey : "";
  if (!apiKey.trim()) throw new NodeFailure("CREDENTIAL_INVALID", "OpenAI connection is missing an API key.", false);
  return { status: "succeeded" as const, output: await generate({ apiKey, model, prompt, maxOutputTokens, timeoutMs, ...(outputSchema ? { outputSchema } : {}) }), route: "success" as const };
}
