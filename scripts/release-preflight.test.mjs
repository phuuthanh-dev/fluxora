import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { runReleasePreflight } from "./release-preflight.mjs";
import { healthTargets } from "./smoke-health.mjs";

const root = resolve(import.meta.dirname, "..");

test("release preflight is read-only, secret-free, and has no blocked repository contracts", () => {
  const report = runReleasePreflight();
  assert.equal(report.schema, "fluxora.release-preflight.v1");
  assert.equal(report.mode, "repository-contract-only");
  assert.equal(report.secretValuesRead, false);
  assert.equal(report.externalRequestsMade, false);
  assert.equal(report.verdict, "CONDITIONAL_GO");
  assert.equal(report.checks.some((check) => check.status === "blocked"), false);
  assert.ok(report.checks.some((check) => check.status === "operator"));
  assert.ok(report.checks.some((check) => check.status === "user_input"));
  assert.doesNotMatch(JSON.stringify(report), /replace-with-a-long-random-password/);
});

test("health smoke builds only fixed GET health targets", () => {
  assert.deepEqual(healthTargets(), [
    { name: "API liveness", url: "http://127.0.0.1:3001/api/v1/health" },
    { name: "API readiness", url: "http://127.0.0.1:3001/api/v1/health/ready" },
    { name: "Web root", url: "http://127.0.0.1:3000/" },
  ]);
  assert.deepEqual(healthTargets({ apiOrigin: "https://api.example.test/ignored", webOrigin: "https://app.example.test/path" }), [
    { name: "API liveness", url: "https://api.example.test/api/v1/health" },
    { name: "API readiness", url: "https://api.example.test/api/v1/health/ready" },
    { name: "Web root", url: "https://app.example.test/" },
  ]);
  assert.throws(() => healthTargets({ apiOrigin: "https://token@example.test", webOrigin: "http://localhost:3000" }));
  assert.throws(() => healthTargets({ apiOrigin: "file:///tmp/socket", webOrigin: "http://localhost:3000" }));
});

test("release automation contains no deployment or provider invocation primitive", () => {
  const smoke = readFileSync(resolve(root, "scripts/smoke-health.mjs"), "utf8");
  const preflight = readFileSync(resolve(root, "scripts/release-preflight.mjs"), "utf8");
  assert.doesNotMatch(smoke, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
  assert.doesNotMatch(smoke, /docker|ssh|steamcommunity|googleapis|discord\.com|api\.telegram/i);
  assert.doesNotMatch(preflight, /\.env\.production["']\)|process\.env|fetch\(|https\.request|child_process/);
});
