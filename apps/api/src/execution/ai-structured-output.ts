import { NodeFailure } from "./node-failure";
import { markNormalizedAiUsage } from "./redaction";
import { validateAiSchema } from "@workflow/contracts";
import type { AiSchema } from "@workflow/contracts";
export type { AiSchema } from "@workflow/contracts";

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function parseAiSchema(value: unknown): AiSchema | undefined {
  if (value === undefined) return undefined;
  const result = validateAiSchema(value);
  if (!result.ok) throw new NodeFailure("INVALID_INPUT", result.message, false);
  return result.schema;
}

function matches(value: unknown, schema: AiSchema): boolean {
  switch (schema.type) {
    case "object": {
      const item = object(value);
      if (!item) return false;
      const properties = schema.properties!;
      return Object.keys(item).every((key) => Object.hasOwn(properties, key)) && schema.required!.every((key) => Object.hasOwn(item, key) && matches(item[key], properties[key]!));
    }
    case "array": return Array.isArray(value) && value.every((item) => matches(item, schema.items!));
    case "string": return typeof value === "string" && (!schema.enum || schema.enum.includes(value));
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "integer": return typeof value === "number" && Number.isSafeInteger(value);
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
  }
}

export function parseAiOutput(text: string, schema: AiSchema): unknown {
  let value: unknown;
  try { value = JSON.parse(text) as unknown; } catch { throw new NodeFailure("INVALID_STRUCTURED_OUTPUT", "Provider returned invalid structured output.", false); }
  if (!matches(value, schema)) throw new NodeFailure("INVALID_STRUCTURED_OUTPUT", "Provider returned invalid structured output.", false);
  return value;
}

export function mockAiOutput(schema: AiSchema): unknown {
  switch (schema.type) {
    case "object": return Object.fromEntries(Object.entries(schema.properties!).map(([key, value]) => [key, mockAiOutput(value)]));
    case "array": return [];
    case "string": return schema.enum?.[0] ?? "";
    case "number": case "integer": return 0;
    case "boolean": return false;
    case "null": return null;
  }
}

/** Gemini's outputTokens is candidate text only; thoughtsTokens is separate, never inferred. */
export function normalizeAiUsage(raw: unknown, names: { input: string; output: string; total: string; thoughts?: string }) {
  const source = object(raw);
  if (!source) return undefined;
  const usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number; thoughtsTokens?: number } = {};
  for (const [target, name] of [["inputTokens", names.input], ["outputTokens", names.output], ["totalTokens", names.total]] as const) {
    const value = source[name];
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) usage[target] = value;
  }
  const thoughts = names.thoughts === undefined ? undefined : source[names.thoughts];
  if (typeof thoughts === "number" && Number.isSafeInteger(thoughts) && thoughts >= 0) usage.thoughtsTokens = thoughts;
  return Object.keys(usage).length ? markNormalizedAiUsage(usage) : undefined;
}
