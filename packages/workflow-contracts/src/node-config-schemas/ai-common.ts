import { z, type ZodType } from "zod";
import { validateAiSchema } from "../ai-schema";
import type { ConfigRules } from "./types";

/** Shared structural limits; server-side operator and provider limits still apply. */
export function aiConfigRules(model: ZodType): ConfigRules {
  return {
    model: { schema: model, message: "Choose a valid model.", required: true },
    prompt: { schema: z.string().max(100_000).refine((value) => Boolean(value.trim())), message: "Enter a prompt of at most 100,000 characters.", required: true },
    maxOutputTokens: { schema: z.number().int().min(1).max(8192), message: "Max output tokens must be between 1 and 8,192." },
    timeoutMs: { schema: z.number().int().min(1000).max(120_000), message: "Timeout must be between 1,000 and 120,000 milliseconds." },
    outputSchema: { schema: z.unknown().refine((value) => validateAiSchema(value).ok), message: "Structured output schema is invalid or unsupported." },
  };
}
