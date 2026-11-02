import { NodeFailure } from "./node-failure";

/** Per-request ceiling; this is not a money or aggregate usage limit. */
export function aiOutputTokenCeiling(setting: string | undefined = process.env.AI_MAX_OUTPUT_TOKENS): number {
  if (setting === undefined) return 8192;
  if (!/^[1-9][0-9]*$/.test(setting)) throw new NodeFailure("AI_LIMIT_CONFIG_INVALID", "AI_MAX_OUTPUT_TOKENS must be an integer from 1 to 8192.", false);
  const value = Number(setting);
  if (!Number.isSafeInteger(value) || value > 8192) throw new NodeFailure("AI_LIMIT_CONFIG_INVALID", "AI_MAX_OUTPUT_TOKENS must be an integer from 1 to 8192.", false);
  return value;
}

export function assertAiRequestLimits(prompt: string, maxOutputTokens: unknown): asserts maxOutputTokens is number {
  if (!prompt.trim() || prompt.length > 100_000) throw new NodeFailure("INVALID_INPUT", "AI prompt must contain 1 to 100,000 characters.", false);
  const ceiling = aiOutputTokenCeiling();
  if (typeof maxOutputTokens !== "number" || !Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > ceiling) {
    throw new NodeFailure("AI_OUTPUT_LIMIT_EXCEEDED", `Max output tokens must be an integer from 1 to ${ceiling} (operator limit).`, false);
  }
}
