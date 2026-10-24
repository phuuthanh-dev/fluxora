import assert from "node:assert/strict";
import test from "node:test";
import { validateEnvironment } from "./environment";

test("production environment requires HTTPS origin and a valid encryption key", () => {
  assert.throws(() => validateEnvironment({ NODE_ENV: "production", WEB_ORIGIN: "http://example.com", APP_ENCRYPTION_KEY: "not-a-valid-key" }));
  assert.doesNotThrow(() => validateEnvironment({ NODE_ENV: "production", WEB_ORIGIN: "https://example.com", APP_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64") }));
});

test("OAuth provider settings are all-or-nothing in production", () => {
  assert.throws(() => validateEnvironment({ NODE_ENV: "production", WEB_ORIGIN: "https://example.com", APP_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"), GITHUB_CLIENT_ID: "client" }));
});
