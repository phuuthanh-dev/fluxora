export type RetryableFailure = {
  code: string;
  statusCode?: number;
  retryable?: boolean;
};

export function isRetryableFailure(failure: RetryableFailure) {
  // Adapters know whether a request may already have changed provider state.
  // Status inference is only for historical failures without a stored decision.
  if (typeof failure.retryable === "boolean") return failure.retryable;
  if (failure.code === "SMTP_AUTH_FAILED" || failure.code === "SMTP_REJECTED") return false;
  return failure.code === "NETWORK_ERROR" || failure.code === "TIMEOUT" || failure.code === "SMTP_TEMPORARY" || failure.statusCode === 429 || (failure.statusCode !== undefined && failure.statusCode >= 500 && failure.statusCode <= 599);
}

export const maximumRetryDelayMs = 30_000;

/** Return an unbounded provider delay so callers can decline an excessive wait. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (value === null || value.length > 128) return undefined;
  const text = value.trim();
  if (/^\d+$/.test(text)) {
    const seconds = Number(text);
    return Number.isSafeInteger(seconds) ? seconds * 1000 : Number.POSITIVE_INFINITY;
  }
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now) : undefined;
}

export function retryDelayMs(attempt: number, providerDelayMs?: number) {
  const backoff = Math.min(maximumRetryDelayMs, 500 * 2 ** Math.max(0, attempt - 1));
  return providerDelayMs === undefined ? backoff : Math.max(backoff, Math.min(maximumRetryDelayMs, Math.max(0, providerDelayMs)));
}
