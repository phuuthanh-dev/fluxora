import assert from "node:assert/strict";
import test from "node:test";
import { validateEnvironment } from "./environment";

test("production environment requires HTTPS origin and a valid encryption key", () => {
  assert.throws(() => validateEnvironment({ NODE_ENV: "production", WEB_ORIGIN: "http://example.com", APP_ENCRYPTION_KEY: "not-a-valid-key" }));
  assert.doesNotThrow(() => validateEnvironment({ NODE_ENV: "production", WEB_ORIGIN: "https://example.com", APP_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"), EXECUTION_QUEUE_MODE: "redis", REDIS_URL: "rediss://queue.example.com" }));
});

test("OAuth provider settings are all-or-nothing in production", () => {
  assert.throws(() => validateEnvironment({ NODE_ENV: "production", WEB_ORIGIN: "https://example.com", APP_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"), EXECUTION_QUEUE_MODE: "redis", REDIS_URL: "redis://queue.example.com", GITHUB_CLIENT_ID: "client" }));
});

test("production requires an explicit Redis execution queue", () => {
  const base = { NODE_ENV: "production", WEB_ORIGIN: "https://example.com", APP_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64") };
  assert.throws(() => validateEnvironment(base), /EXECUTION_QUEUE_MODE must be redis/);
  assert.throws(() => validateEnvironment({ ...base, EXECUTION_QUEUE_MODE: "redis" }), /REDIS_URL must be configured/);
  assert.throws(() => validateEnvironment({ ...base, EXECUTION_QUEUE_MODE: "redis", REDIS_URL: "https://queue.example.com" }), /REDIS_URL must use redis/);
});

test("managed GitHub webhooks require a public HTTPS API origin when enabled", () => {
  const base = { NODE_ENV: "production", WEB_ORIGIN: "https://example.com", APP_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"), EXECUTION_QUEUE_MODE: "redis", REDIS_URL: "redis://queue.example.com", GITHUB_WEBHOOK_AUTOMATION_ENABLED: "true" };
  assert.throws(() => validateEnvironment(base), /PUBLIC_API_ORIGIN/);
  assert.doesNotThrow(() => validateEnvironment({ ...base, PUBLIC_API_ORIGIN: "https://api.example.com" }));
});

test("queue mode rejects unknown configuration in every environment", () => {
  assert.throws(() => validateEnvironment({ NODE_ENV: "development", EXECUTION_QUEUE_MODE: "fallback" }), /EXECUTION_QUEUE_MODE must be inline or redis/);
  assert.throws(() => validateEnvironment({ NODE_ENV: "development", EXECUTION_WORKER_CONCURRENCY: "0" }), /EXECUTION_WORKER_CONCURRENCY/);
});
