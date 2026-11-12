import { createSecretKey } from "node:crypto";
import { resolveExecutionQueueName, resolveQueueMode } from "../execution/execution-queue.config";
import { resolveWorkerConcurrency } from "../execution/worker-concurrency";

export function validateEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  const queueMode = resolveQueueMode(environment.EXECUTION_QUEUE_MODE);
  resolveExecutionQueueName(environment.EXECUTION_QUEUE_NAME);
  resolveWorkerConcurrency(environment.EXECUTION_WORKER_CONCURRENCY);
  if (environment.NODE_ENV !== "production") return;
  requireHttpsUrl(environment.WEB_ORIGIN, "WEB_ORIGIN");
  requireEncryptionKey(environment.APP_ENCRYPTION_KEY);
  if (queueMode !== "redis") throw new Error("EXECUTION_QUEUE_MODE must be redis in production.");
  requireRedisUrl(environment.REDIS_URL);
  if (environment.GITHUB_WEBHOOK_AUTOMATION_ENABLED === "true" || environment.JIRA_WEBHOOK_AUTOMATION_ENABLED === "true") requireHttpsUrl(environment.PUBLIC_API_ORIGIN, "PUBLIC_API_ORIGIN");
  if (environment.JIRA_WEBHOOK_AUTOMATION_ENABLED === "true") {
    requireAllOrNone(environment, ["JIRA_CLIENT_ID", "JIRA_CLIENT_SECRET", "JIRA_REDIRECT_URI"]);
    if (!environment.JIRA_CLIENT_SECRET || !environment.JIRA_CLIENT_ID || !environment.JIRA_REDIRECT_URI) throw new Error("Jira OAuth must be configured when Jira webhooks are enabled.");
  }
  requireCompleteOAuthConfig(environment, "GOOGLE");
  requireCompleteOAuthConfig(environment, "GITHUB");
  requireAllOrNone(environment, ["AIRTABLE_CLIENT_ID", "AIRTABLE_CLIENT_SECRET", "AIRTABLE_REDIRECT_URI"]);
  if (environment.AIRTABLE_REDIRECT_URI) requireHttpsUrl(environment.AIRTABLE_REDIRECT_URI, "AIRTABLE_REDIRECT_URI");
  requireAllOrNone(environment, ["STEAM_OPENID_RETURN_URI", "STEAM_OPENID_REALM"]);
}

function requireRedisUrl(value: string | undefined) {
  if (!value) throw new Error("REDIS_URL must be configured in production.");
  const url = new URL(value);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") throw new Error("REDIS_URL must use redis or rediss protocol.");
}

function requireHttpsUrl(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} must be configured in production.`);
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS in production.`);
}

function requireEncryptionKey(value: string | undefined) {
  if (!value) throw new Error("APP_ENCRYPTION_KEY must be configured in production.");
  try {
    if (createSecretKey(Buffer.from(value, "base64")).symmetricKeySize !== 32) throw new Error();
  } catch {
    throw new Error("APP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
}

function requireCompleteOAuthConfig(environment: NodeJS.ProcessEnv, prefix: "GOOGLE" | "GITHUB") {
  requireAllOrNone(environment, [`${prefix}_CLIENT_ID`, `${prefix}_CLIENT_SECRET`, `${prefix}_AUTH_REDIRECT_URI`]);
}

function requireAllOrNone(environment: NodeJS.ProcessEnv, names: string[]) {
  const values = names.map((name) => environment[name]);
  if (values.some(Boolean) && values.some((value) => !value)) throw new Error(`${names.join(", ")} must be configured together.`);
}
