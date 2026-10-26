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
const pruneImages = resolve(root, "infra/scripts/prune-application-images.sh");
const apiDockerfile = readFileSync(resolve(root, "apps/api/Dockerfile"), "utf8");
const apiRuntimeDockerfile = apiDockerfile.split("FROM node:22-bookworm-slim AS runtime", 2)[1] ?? "";
const apiPackage = JSON.parse(readFileSync(resolve(root, "apps/api/package.json"), "utf8"));
const webDockerfile = readFileSync(resolve(root, "apps/web/Dockerfile"), "utf8");
const compose = readFileSync(resolve(root, "infra/docker-compose.production.yml"), "utf8");
const stagingCompose = readFileSync(resolve(root, "infra/docker-compose.staging.yml"), "utf8");
const workflow = readFileSync(resolve(root, ".github/workflows/deploy-production.yml"), "utf8");
const stagingWorkflow = readFileSync(resolve(root, ".github/workflows/deploy-staging.yml"), "utf8");
const qualityWorkflow = readFileSync(resolve(root, ".github/workflows/quality.yml"), "utf8");
const envExample = readFileSync(resolve(root, "infra/.env.production.example"), "utf8");
const deployScript = readFileSync(deploy, "utf8");
const deployStagingScript = readFileSync(deployStaging, "utf8");
const pruneImagesScript = readFileSync(pruneImages, "utf8");

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
  execFileSync("sh", ["-n", pruneImages]);
});

test("CI/CD workflow keeps bounded jobs, cache, and least-privilege deploy permissions", () => {
  assert.match(qualityWorkflow, /timeout-minutes:\s*20/);
  assert.match(qualityWorkflow, /uses: actions\/cache@v4/);
  assert.match(qualityWorkflow, /path: ~\/\.cache\/ms-playwright/);

  for (const deployWorkflow of [workflow, stagingWorkflow]) {
    assert.match(deployWorkflow, /timeout-minutes:\s*20/);
    assert.match(deployWorkflow, /timeout-minutes:\s*15/);
    assert.match(deployWorkflow, /cache-from: type=gha,scope=workflow-api/);
    assert.match(deployWorkflow, /cache-to: type=gha,mode=max,scope=workflow-api/);
    assert.match(deployWorkflow, /cache-from: type=gha,scope=workflow-web/);
    assert.match(deployWorkflow, /cache-to: type=gha,mode=max,scope=workflow-web/);
    assert.doesNotMatch(deployWorkflow, /source:.*infra\/nginx/);
  }

  assert.match(workflow, /build:\n[\s\S]*permissions:\n\s+contents: read\n\s+packages: write/);
  assert.match(stagingWorkflow, /build:\n[\s\S]*permissions:\n\s+contents: read\n\s+packages: write/);
  assert.match(workflow, /deploy:\n[\s\S]*permissions:\n\s+contents: read/);
  assert.match(stagingWorkflow, /deploy:\n[\s\S]*permissions:\n\s+contents: read/);
});

test("deploy cleanup retains rollback images and never prunes infrastructure", () => {
  assert.match(deployScript, /prune-application-images\.sh/);
  assert.match(deployStagingScript, /prune-application-images\.sh/);
  assert.match(pruneImagesScript, /API_IMAGE/);
  assert.match(pruneImagesScript, /WEB_IMAGE/);
  assert.match(pruneImagesScript, /PREVIOUS_API_IMAGE_TAG/);
  assert.match(pruneImagesScript, /PREVIOUS_WEB_IMAGE_TAG/);
  assert.match(pruneImagesScript, /validate-image-tag\.sh/);
  assert.match(pruneImagesScript, /docker image rm/);
  assert.doesNotMatch(pruneImagesScript, /docker system prune/);
  assert.doesNotMatch(pruneImagesScript, /docker volume/);
  assert.doesNotMatch(pruneImagesScript, /postgres|redis/i);
});

test("API runtime image installs only API and contracts workspaces", () => {
  assert.equal(apiPackage.dependencies["@workflow/contracts"], "*");
  assert.match(apiRuntimeDockerfile, /--workspace=@workflow\/api/);
  assert.match(apiRuntimeDockerfile, /--workspace=@workflow\/contracts/);
  assert.match(apiRuntimeDockerfile, /--include-workspace-root=false/);
  assert.match(apiRuntimeDockerfile, /COPY packages\/workflow-contracts\/package\.json/);
  assert.match(apiRuntimeDockerfile, /COPY --from=build \/app\/packages\/workflow-contracts\/dist/);
  assert.doesNotMatch(apiRuntimeDockerfile, /COPY packages packages/);
  assert.doesNotMatch(apiRuntimeDockerfile, /COPY --from=build \/app\/packages\/workflow-contracts \.\/packages\/workflow-contracts/);
});

test("application deploy does not refresh database or Redis images", () => {
  assert.match(deployScript, /pull migrate api worker web/);
  assert.match(deployStagingScript, /pull migrate api worker web/);
  assert.doesNotMatch(deployScript, /\bpull\s*\n/);
  assert.doesNotMatch(deployStagingScript, /\bpull\s*\n/);
});
