const sensitiveKey = /(authorization|password|secret|token|api[_-]?key|webhook[_-]?url)/i;

export function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sensitiveKey.test(key) ? "[REDACTED]" : redactValue(item)]));
  }
  return value;
}
