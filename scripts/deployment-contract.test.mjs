import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..");
const validator = resolve(root, "infra/scripts/validate-image-tag.sh");
const deploy = resolve(root, "infra/scripts/deploy.sh");
const rollback = resolve(root, "infra/scripts/rollback.sh");
const deployStaging = resolve(root, "infra/scripts/deploy-staging.sh");
const healthcheck = resolve(root, "infra/scripts/healthcheck.sh");
const apiDockerfile = readFileSync(resolve(root, "apps/api/Dockerfile"), "utf8");
const webDockerfile = readFileSync(resolve(root, "apps/web/Dockerfile"), "utf8");
const compose = readFileSync(resolve(root, "infra/docker-compose.production.yml"), "utf8");
const stagingCompose = readFileSync(resolve(root, "infra/docker-compose.staging.yml"), "utf8");
const workflow = readFileSync(resolve(root, ".github/workflows/deploy-production.yml"), "utf8");
const stagingWorkflow = readFileSync(resolve(root, ".github/workflows/deploy-staging.yml"), "utf8");
const envExample = readFileSync(resolve(root, "infra/.env.production.example"), "utf8");

const sha = "0123456789abcdef0123456789abcdef01234567";

test("deployment accepts only a full lowercase commit SHA", () => {
  const result = spawnSync(validator, [sha], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), sha);
});

test("deployment rejects mutable or malformed image tags", () => {
  for (const tag of ["latest", "staging", sha.slice(0, 7), sha.toUpperCase(), `${sha}-dev`]) {
    const result = spawnSync(validator, [tag], { encoding: "utf8" });
    assert.notEqual(result.status, 0, `expected rejection for ${tag}`);
  }
});

test("production deployment contract cannot fall back to latest", () => {
  assert.match(workflow, /commit_sha:/);
  assert.doesNotMatch(workflow, /default:\s*["']latest["']/);
  assert.match(workflow, /ref: \$\{\{ inputs\.commit_sha \}\}/);
  assert.match(workflow, /checked out commit does not match commit_sha/);
  assert.doesNotMatch(compose, /:\$\{IMAGE_TAG:-latest\}/);
  assert.match(compose, /IMAGE_TAG:\?IMAGE_TAG is required/);
  assert.match(stagingCompose, /IMAGE_TAG:\?IMAGE_TAG is required/);
  assert.doesNotMatch(stagingCompose, /build:/);
  assert.match(stagingWorkflow, /workflow_run:/);
  assert.match(stagingWorkflow, /workflow_run\.conclusion == 'success'/);
  assert.match(stagingWorkflow, /deploy-staging\.sh/);
  assert.match(apiDockerfile, /org\.opencontainers\.image\.source="https:\/\/github\.com\/phuuthanh-dev\/workflow-automation"/);
  assert.match(webDockerfile, /org\.opencontainers\.image\.source="https:\/\/github\.com\/phuuthanh-dev\/workflow-automation"/);
  assert.match(envExample, /^IMAGE_TAG=$/m);
});

test("deployment scripts pass shell syntax validation", () => {
  execFileSync("sh", ["-n", validator]);
  execFileSync("sh", ["-n", deploy]);
  execFileSync("sh", ["-n", rollback]);
  execFileSync("sh", ["-n", deployStaging]);
  execFileSync("sh", ["-n", healthcheck]);
});
