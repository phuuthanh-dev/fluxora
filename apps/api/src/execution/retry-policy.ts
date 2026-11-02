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

export function retryDelayMs(attempt: number) {
  return Math.min(30_000, 500 * 2 ** Math.max(0, attempt - 1));
}
