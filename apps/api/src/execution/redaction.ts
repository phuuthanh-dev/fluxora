const sensitiveKey = /(authorization|password|secret|token|api[_-]?key|webhook[_-]?url)/i;
const normalizedAiUsage = new WeakSet<object>();
const pageTokenOutputs = new WeakSet<object>();

/** Called only by provider adapters after validating a top-level continuation token. */
export function markPageTokenOutput<T extends object>(output: T): T {
  pageTokenOutputs.add(output);
  return output;
}
export const markDriveListOutput = markPageTokenOutput;

/** Mark server-normalized usage, never caller-provided output, as eligible for numeric counters. */
export function markNormalizedAiUsage<T extends object>(usage: T): T {
  normalizedAiUsage.add(usage);
  return usage;
}

export function redactTelegramTokenInUrl(value: string): string {
  return value.replace(/(\/bot)[^/\s]+/gi, "$1[REDACTED]");
}

export function redactValue(value: unknown): unknown {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  const aiOutput = typeof record?.text === "string" && typeof record.model === "string" && (typeof record.finishReason === "string" || record.finishReason === null);
  return redact(value, false, aiOutput, record !== undefined && pageTokenOutputs.has(record));
}

function redact(value: unknown, usage: boolean, aiOutput = false, pageTokenOutput = false): unknown {
  if (typeof value === "string") return redactTelegramTokenInUrl(value);
  if (Array.isArray(value)) return value.map((item) => redact(item, false));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      const safeCount = usage && ["inputTokens", "outputTokens", "totalTokens", "thoughtsTokens"].includes(key) && typeof item === "number" && Number.isSafeInteger(item) && item >= 0;
      const trustedUsage = aiOutput && key === "usage" && item !== null && typeof item === "object" && normalizedAiUsage.has(item);
      if (pageTokenOutput && key === "nextPageToken" && (item === null || typeof item === "string")) return [key, item];
      return [key, sensitiveKey.test(key) && !safeCount ? "[REDACTED]" : redact(item, trustedUsage)];
    }));
  }
  return value;
}
