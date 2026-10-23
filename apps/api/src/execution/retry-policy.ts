export type RetryableFailure = {
  code: string;
  statusCode?: number;
};

export function isRetryableFailure(failure: RetryableFailure) {
  return failure.code === "NETWORK_ERROR" || failure.code === "TIMEOUT" || failure.statusCode === 429 || (failure.statusCode !== undefined && failure.statusCode >= 500 && failure.statusCode <= 599);
}

export function retryDelayMs(attempt: number) {
  return Math.min(30_000, 500 * 2 ** Math.max(0, attempt - 1));
}
