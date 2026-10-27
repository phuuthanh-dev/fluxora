export const executionQueueName = "workflow-executions";
export type QueueMode = "inline" | "redis";

export function resolveQueueMode(value = process.env.EXECUTION_QUEUE_MODE): QueueMode {
  if (!value || value === "inline") return "inline";
  if (value === "redis") return "redis";
  throw new Error("EXECUTION_QUEUE_MODE must be inline or redis.");
}

export function resolveExecutionQueueName(value = process.env.EXECUTION_QUEUE_NAME) {
  const name = value?.trim() || executionQueueName;
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error("EXECUTION_QUEUE_NAME may contain only letters, numbers, underscores, and hyphens.");
  return name;
}
