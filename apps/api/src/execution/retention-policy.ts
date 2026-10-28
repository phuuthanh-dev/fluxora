export function executionRetentionPolicy(environment: NodeJS.ProcessEnv = process.env) {
  return {
    successDays: positiveInteger(environment.EXECUTION_RETENTION_SUCCESS_DAYS, 14),
    failedDays: positiveInteger(environment.EXECUTION_RETENTION_FAILED_DAYS, 30),
    maxCount: nonNegativeInteger(environment.EXECUTION_RETENTION_MAX_COUNT, 10_000),
  };
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
