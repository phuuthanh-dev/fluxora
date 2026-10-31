import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { readBoundedProviderJson } from "./provider-json";

export type GeminiTextInput = {
  apiKey: string;
  model: string;
  prompt: string;
  maxOutputTokens?: number;
  timeoutMs: number;
};

type GeminiTransport = (url: string, init: RequestInit) => Promise<Response>;

/** Return only provider model identifiers that advertise text generation. */
export async function listGeminiTextModels(apiKey: string, transport: GeminiTransport = fetchSafeOutbound) {
  if (!apiKey.trim()) throw new NodeFailure("INVALID_INPUT", "Gemini API key is required.", false);
  let response: Response;
  try {
    response = await transport("https://generativelanguage.googleapis.com/v1beta/models?pageSize=100", {
      method: "GET", headers: { "x-goog-api-key": apiKey }, signal: AbortSignal.timeout(10_000),
    });
  } catch (error) { throw nodeFailureFromOutboundPolicy(error); }
  if (!response.ok) throw new NodeFailure("HTTP_ERROR", `Gemini returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
  let payload: unknown;
  try { payload = await readBoundedProviderJson(response); } catch (error) { if (error instanceof NodeFailure) throw error; throw new NodeFailure("INVALID_RESPONSE", "Gemini returned an invalid model list.", false); }
  const root = asRecord(payload);
  if (!root || !Array.isArray(root.models)) throw new NodeFailure("INVALID_RESPONSE", "Gemini returned an invalid model list.", false);
  const models = root.models.slice(0, 100).flatMap((item) => {
    const model = asRecord(item);
    const name = model?.name;
    const methods = model?.supportedGenerationMethods;
    if (typeof name !== "string" || !/^models\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(name) || !Array.isArray(methods) || !methods.includes("generateContent")) return [];
    return [{ id: name, label: typeof model?.displayName === "string" ? model.displayName.slice(0, 160) : name }];
  });
  return { models, hasMore: typeof root.nextPageToken === "string" && root.nextPageToken.length > 0 };
}

/** Server-side text-generation primitive; credentials never leave the server. */
export async function generateGeminiText(input: GeminiTextInput, transport: GeminiTransport = fetchSafeOutbound) {
  const model = input.model.replace(/^models\//, "");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(model) || !input.apiKey.trim() || !input.prompt.trim() || input.prompt.length > 100_000) {
    throw new NodeFailure("INVALID_INPUT", "Gemini model, API key or prompt is invalid.", false);
  }
  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 1000 || input.timeoutMs > 120_000 || (input.maxOutputTokens !== undefined && (!Number.isInteger(input.maxOutputTokens) || input.maxOutputTokens < 1 || input.maxOutputTokens > 8192))) {
    throw new NodeFailure("INVALID_INPUT", "Gemini timeout or output limit is invalid.", false);
  }
  let response: Response;
  try {
    response = await transport(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": input.apiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: input.prompt }] }], ...(input.maxOutputTokens === undefined ? {} : { generationConfig: { maxOutputTokens: input.maxOutputTokens } }) }),
      signal: AbortSignal.timeout(input.timeoutMs),
    });
  } catch (error) {
    throw nodeFailureFromOutboundPolicy(error);
  }
  if (!response.ok) throw new NodeFailure("HTTP_ERROR", `Gemini returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
  let payload: unknown;
  try { payload = await readBoundedProviderJson(response); } catch (error) { if (error instanceof NodeFailure) throw error; throw new NodeFailure("INVALID_RESPONSE", "Gemini returned an invalid response.", false); }
  const root = asRecord(payload);
  const candidates = Array.isArray(root?.candidates) ? root.candidates : [];
  const first = asRecord(candidates[0]);
  const content = asRecord(first?.content);
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const text = parts.flatMap((part) => {
    const value = asRecord(part);
    return value?.thought !== true && typeof value?.text === "string" ? [value.text] : [];
  }).join("");
  if (!text) throw new NodeFailure("EMPTY_RESPONSE", "Gemini returned no text; the response may have been blocked or empty.", false);
  if (text.length > 100_000) throw new NodeFailure("RESPONSE_TOO_LARGE", "Gemini returned too much text.", false);
  return { text, model, finishReason: typeof first?.finishReason === "string" ? first.finishReason : null };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export async function executeGeminiText(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, generate: typeof generateGeminiText = generateGeminiText) {
  const model = typeof config.model === "string" ? config.model : "";
  const prompt = typeof config.prompt === "string" ? config.prompt : "";
  const maxOutputTokens = config.maxOutputTokens === undefined ? 1024 : config.maxOutputTokens;
  const timeoutMs = config.timeoutMs === undefined ? 30_000 : config.timeoutMs;
  if (!/^(?:models\/)?[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(model) || !prompt.trim() || prompt.length > 100_000 ||
      typeof maxOutputTokens !== "number" || !Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 8192 ||
      typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120_000) {
    throw new NodeFailure("INVALID_INPUT", "Gemini model, prompt, output limit or timeout is invalid.", false);
  }
  if (mode === "mock") return { status: "succeeded" as const, output: { text: "Mock Gemini response", model: model.replace(/^models\//, ""), finishReason: "STOP" }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select a Gemini connection.", false);
  const credential = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.GEMINI);
  const apiKey = typeof credential.apiKey === "string" ? credential.apiKey : "";
  return { status: "succeeded" as const, output: await generate({ apiKey, model, prompt, maxOutputTokens, timeoutMs }), route: "success" as const };
}
