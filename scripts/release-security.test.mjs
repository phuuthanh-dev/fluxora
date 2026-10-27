import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { scanContent, scanTrackedFiles } from "./scan-tracked-secrets.mjs";
import { validateProductionEnv } from "./validate-production-env.mjs";

function validEnv(overrides = {}) {
  return Object.entries({
    POSTGRES_USER: "workflow",
    POSTGRES_PASSWORD: "a-long-test-password-that-is-not-a-production-secret",
    POSTGRES_DB: "workflow",
    IMAGE_TAG: "0123456789abcdef0123456789abcdef01234567",
    API_IMAGE: "ghcr.io/example/workflow-api",
    WEB_IMAGE: "ghcr.io/example/workflow-web",
    NEXT_PUBLIC_API_URL: "https://api.example.test/api/v1",
    WEB_ORIGIN: "https://app.example.test",
    NODE_ENV: "production",
    EXECUTION_QUEUE_MODE: "redis",
    EXECUTION_QUEUE_NAME: "workflow-executions",
    EXECUTION_EVENTS_CHANNEL: "workflow:execution-events",
    EXECUTION_WORKER_CONCURRENCY: "2",
    JWT_ACCESS_SECRET: "a".repeat(40),
    JWT_REFRESH_SECRET: "b".repeat(40),
    APP_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    GOOGLE_REDIRECT_URI: "https://api.example.test/api/v1/oauth/google/callback",
    GOOGLE_AUTH_REDIRECT_URI: "https://api.example.test/api/v1/auth/google/callback",
    GITHUB_AUTH_REDIRECT_URI: "https://api.example.test/api/v1/auth/github/callback",
    STEAM_OPENID_RETURN_URI: "https://api.example.test/api/v1/auth/steam/callback",
    STEAM_OPENID_REALM: "https://app.example.test",
    ...overrides,
  }).map(([key, value]) => `${key}=${value}`).join("\n");
}

test("production environment validator accepts a complete safe-shaped fixture", () => {
  const result = validateProductionEnv(validEnv());
  assert.equal(result.valid, true, result.errors.join("\n"));
});

test("production environment validator rejects placeholders, incomplete OAuth, and unsafe URLs", () => {
  const result = validateProductionEnv(validEnv({
    APP_ENCRYPTION_KEY: "base64-encoded-32-byte-key",
    GOOGLE_CLIENT_ID: "client-id",
    WEB_ORIGIN: "http://app.example.test",
  }));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("APP_ENCRYPTION_KEY")));
  assert.ok(result.errors.some((error) => error.includes("provider group")));
  assert.ok(result.errors.some((error) => error.includes("WEB_ORIGIN")));
  assert.doesNotMatch(result.errors.join("\n"), /base64-encoded-32-byte-key/);
});

test("tracked secret scan reports only safe metadata and detects high-confidence tokens", () => {
  const safe = scanTrackedFiles(["docs/01-product-spec.md"]);
  assert.deepEqual(safe, []);
  const fakeToken = ["123456789", ":", "abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJ"].join("");
  const findings = scanContent(`TELEGRAM_BOT_TOKEN=${fakeToken}`, "fixture.txt");
  assert.equal(findings[0]?.pattern, "Telegram bot token");
  const scannerSource = readFileSync(new URL("./scan-tracked-secrets.mjs", import.meta.url), "utf8");
  assert.match(scannerSource, /Telegram bot token/);
  assert.match(scannerSource, /private key block/);
});
