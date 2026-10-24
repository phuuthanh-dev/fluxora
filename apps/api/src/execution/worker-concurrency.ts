const defaultWorkerConcurrency = 2;
const maximumWorkerConcurrency = 20;

export function resolveWorkerConcurrency(value = process.env.EXECUTION_WORKER_CONCURRENCY) {
  if (!value) return defaultWorkerConcurrency;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximumWorkerConcurrency) {
    throw new Error(`EXECUTION_WORKER_CONCURRENCY must be an integer between 1 and ${maximumWorkerConcurrency}.`);
  }
  return parsed;
}
