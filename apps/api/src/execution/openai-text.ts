import { CredentialProvider } from "@prisma/client";
import type { CredentialService } from "../credentials/credential.service";
import { NodeFailure, nodeFailureFromOutboundPolicy } from "./node-failure";
import { fetchSafeOutbound } from "./outbound-url-policy";
import { readBoundedProviderJson } from "./provider-json";

type Transport = (url: string, init: RequestInit) => Promise<Response>;
type OpenAIInput = { apiKey: string; model: string; prompt: string; maxOutputTokens: number; timeoutMs: number };

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

async function request(url: string, init: RequestInit, transport: Transport): Promise<unknown> {
  let response: Response;
  try { response = await transport(url, init); } catch (reason) { throw nodeFailureFromOutboundPolicy(reason); }
  if (!response.ok) throw new NodeFailure("HTTP_ERROR", `OpenAI returned ${response.status}.`, response.status === 429 || response.status >= 500, response.status);
  try { return await readBoundedProviderJson(response); } catch (reason) {
    if (reason instanceof NodeFailure) throw reason;
    throw new NodeFailure("INVALID_RESPONSE", "OpenAI returned an invalid response.", false);
  }
}

export async function listOpenAIModels(apiKey: string, transport: Transport = fetchSafeOutbound) {
  if (!apiKey.trim()) throw new NodeFailure("INVALID_INPUT", "OpenAI API key is required.", false);
  const root = record(await request("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(10_000) }, transport));
  if (!root || !Array.isArray(root.data)) throw new NodeFailure("INVALID_RESPONSE", "OpenAI returned an invalid model list.", false);
  const valid = root.data.flatMap((item) => {
    const model = record(item);
    return typeof model?.id === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(model.id) ? [{ id: model.id, label: model.id }] : [];
  });
  return { models: valid.slice(0, 100), hasMore: valid.length > 100 };
}

export async function generateOpenAIText(input: OpenAIInput, transport: Transport = fetchSafeOutbound) {
  const root = record(await request("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${input.apiKey}` },
    body: JSON.stringify({ model: input.model, input: input.prompt, max_output_tokens: input.maxOutputTokens, store: false }),
    signal: AbortSignal.timeout(input.timeoutMs),
  }, transport));
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
  if (!text) throw new NodeFailure(refused ? "PROVIDER_REFUSAL" : "EMPTY_RESPONSE", refused ? "OpenAI declined the request." : "OpenAI returned no text.", false);
  if (text.length > 100_000) throw new NodeFailure("RESPONSE_TOO_LARGE", "OpenAI returned too much text.", false);
  return { text, model: input.model, finishReason: "completed" };
}

export async function executeOpenAIText(config: Record<string, unknown>, mode: "mock" | "live", workspaceId: string, credentials: CredentialService, generate: typeof generateOpenAIText = generateOpenAIText) {
  const model = typeof config.model === "string" ? config.model : "";
  const prompt = typeof config.prompt === "string" ? config.prompt : "";
  const maxOutputTokens = config.maxOutputTokens === undefined ? 1024 : config.maxOutputTokens;
  const timeoutMs = config.timeoutMs === undefined ? 30_000 : config.timeoutMs;
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(model) || !prompt.trim() || prompt.length > 100_000 ||
      typeof maxOutputTokens !== "number" || !Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 8192 ||
      typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120_000) {
    throw new NodeFailure("INVALID_INPUT", "OpenAI model, prompt, output limit or timeout is invalid.", false);
  }
  if (mode === "mock") return { status: "succeeded" as const, output: { text: "Mock OpenAI response", model, finishReason: "completed" }, route: "success" as const };
  const credentialId = typeof config.credentialId === "string" ? config.credentialId : "";
  if (!credentialId) throw new NodeFailure("CREDENTIAL_REQUIRED", "Select an OpenAI connection.", false);
  const credential = await credentials.readForExecution(credentialId, workspaceId, CredentialProvider.OPENAI);
  const apiKey = typeof credential.apiKey === "string" ? credential.apiKey : "";
  if (!apiKey.trim()) throw new NodeFailure("CREDENTIAL_INVALID", "OpenAI connection is missing an API key.", false);
  return { status: "succeeded" as const, output: await generate({ apiKey, model, prompt, maxOutputTokens, timeoutMs }), route: "success" as const };
}
