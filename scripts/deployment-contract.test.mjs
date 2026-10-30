import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..");
const validator = resolve(root, "infra/scripts/validate-image-tag.sh");
const deploy = resolve(root, "infra/scripts/deploy.sh");
const rollback = resolve(root, "infra/scripts/rollback.sh");
const healthcheck = resolve(root, "infra/scripts/healthcheck.sh");
const pruneImages = resolve(root, "infra/scripts/prune-application-images.sh");
const checkDiskSpace = resolve(root, "infra/scripts/check-disk-space.sh");
const backupPostgres = resolve(root, "infra/scripts/backup-postgres.sh");
const restorePostgres = resolve(root, "infra/scripts/restore-postgres.sh");
const pruneGhcrVersions = resolve(root, "infra/scripts/prune-ghcr-versions.sh");
const apiDockerfile = readFileSync(resolve(root, "apps/api/Dockerfile"), "utf8");
const apiRuntimeDockerfile = apiDockerfile.split("FROM node:22-bookworm-slim AS runtime", 2)[1] ?? "";
const apiPackage = JSON.parse(readFileSync(resolve(root, "apps/api/package.json"), "utf8"));
const webDockerfile = readFileSync(resolve(root, "apps/web/Dockerfile"), "utf8");
const compose = readFileSync(resolve(root, "infra/docker-compose.production.yml"), "utf8");
const workflow = readFileSync(resolve(root, ".github/workflows/deploy-production.yml"), "utf8");
const qualityWorkflow = readFileSync(resolve(root, ".github/workflows/quality.yml"), "utf8");
const retentionWorkflow = readFileSync(resolve(root, ".github/workflows/retain-ghcr.yml"), "utf8");
const envExample = readFileSync(resolve(root, "infra/.env.production.example"), "utf8");
const nginxTemplate = readFileSync(resolve(root, "infra/nginx/workflow-automation.conf.template"), "utf8");
const rootPackage = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const deployScript = readFileSync(deploy, "utf8");
const healthcheckScript = readFileSync(healthcheck, "utf8");
const pruneImagesScript = readFileSync(pruneImages, "utf8");
const pruneGhcrScript = readFileSync(pruneGhcrVersions, "utf8");

test("standalone web image includes the local landing artwork", () => {
  const runtime = webDockerfile.split("AS runtime", 2)[1] ?? "";
  assert.match(runtime, /COPY --from=build \/app\/apps\/web\/public \.\/apps\/web\/public/);
  const manifest = JSON.parse(readFileSync(resolve(root, "apps/web/public/relay/manifest.json"), "utf8"));
  assert.ok(manifest.assets.length > 0);
  for (const asset of manifest.assets) {
    assert.equal(readFileSync(resolve(root, "apps/web/public/relay", asset.path)).length, asset.bytes);
  }
});

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
  assert.match(workflow, /workflow_run:\n\s+workflows: \["Quality gate"\]/);
  assert.match(workflow, /types: \[completed\]/);
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /group: production-deploy[\s\S]*cancel-in-progress: false/);
  assert.doesNotMatch(workflow, /needs\.scope\.outputs\.deploy/);
  assert.match(workflow, /needs: build/);
  assert.match(workflow, /COMMIT_SHA: \$\{\{ github\.event_name == 'workflow_dispatch'/);
  assert.doesNotMatch(workflow, /default:\s*["']latest["']/);
  assert.match(workflow, /ref: \$\{\{ env\.COMMIT_SHA \}\}/);
  assert.match(workflow, /checked out commit does not match COMMIT_SHA/);
  assert.doesNotMatch(compose, /:\$\{IMAGE_TAG:-latest\}/);
  assert.match(compose, /IMAGE_TAG:\?IMAGE_TAG is required/);
  assert.match(apiDockerfile, /org\.opencontainers\.image\.source="https:\/\/github\.com\/phuuthanh-dev\/workflow-automation"/);
  assert.match(webDockerfile, /org\.opencontainers\.image\.source="https:\/\/github\.com\/phuuthanh-dev\/workflow-automation"/);
  assert.match(envExample, /^IMAGE_TAG=$/m);
});

test("deployment scripts pass shell syntax validation", () => {
  execFileSync("sh", ["-n", validator]);
  execFileSync("sh", ["-n", deploy]);
  execFileSync("sh", ["-n", rollback]);
  execFileSync("sh", ["-n", healthcheck]);
  execFileSync("sh", ["-n", pruneImages]);
  execFileSync("sh", ["-n", checkDiskSpace]);
  execFileSync("sh", ["-n", pruneGhcrVersions]);
  execFileSync("sh", ["-n", backupPostgres]);
  execFileSync("sh", ["-n", restorePostgres]);
});

test("database recovery scripts require an explicit guarded workflow", () => {
  const backupScript = readFileSync(backupPostgres, "utf8");
  const restoreScript = readFileSync(restorePostgres, "utf8");
  assert.match(backupScript, /pg_dump/);
  assert.match(backupScript, /--format=custom/);
  assert.match(backupScript, /chmod 600/);
  assert.match(restoreScript, /CONFIRM_RESTORE/);
  assert.match(restoreScript, /pg_restore/);
  assert.match(restoreScript, /--exit-on-error/);
  assert.doesNotMatch(restoreScript, /docker compose down/);
});

test("CI/CD workflow keeps bounded jobs, cache, and least-privilege deploy permissions", () => {
  assert.match(qualityWorkflow, /timeout-minutes:\s*20/);
  assert.match(qualityWorkflow, /uses: actions\/cache@[0-9a-f]{40}/);
  assert.match(qualityWorkflow, /path: ~\/\.cache\/ms-playwright/);
  assert.match(qualityWorkflow, /concurrency:/);
  assert.match(qualityWorkflow, /cancel-in-progress: true/);
  assert.match(qualityWorkflow, /jobs:\n\s+scope:/);
  assert.match(qualityWorkflow, /outputs:\n\s+run_verify:/);
  assert.match(qualityWorkflow, /git diff --no-renames --name-only/);
  assert.match(qualityWorkflow, /needs: scope/);
  assert.match(qualityWorkflow, /needs\.scope\.outputs\.run_verify/);
  assert.doesNotMatch(qualityWorkflow, /uses: [^\n]+@v\d/);
  assert.match(qualityWorkflow, /Install Playwright Chromium/);
  assert.match(qualityWorkflow, /npx playwright install chromium/);
  assert.doesNotMatch(qualityWorkflow, /playwright install --with-deps/);
  assert.match(qualityWorkflow, /npm audit --omit=dev --audit-level=high/);

  assert.match(workflow, /timeout-minutes:\s*20/);
  assert.match(workflow, /timeout-minutes:\s*15/);
  assert.match(workflow, /cache-from: type=gha,scope=workflow-api/);
  assert.match(workflow, /cache-to: type=gha,mode=max,scope=workflow-api/);
  assert.match(workflow, /cache-from: type=gha,scope=workflow-web/);
  assert.match(workflow, /cache-to: type=gha,mode=max,scope=workflow-web/);
  assert.doesNotMatch(workflow, /source:.*infra\/nginx/);

  assert.match(workflow, /build:\n[\s\S]*permissions:\n\s+contents: read\n\s+packages: write/);
  assert.match(workflow, /deploy:\n[\s\S]*permissions:\n\s+contents: read/);
  assert.match(workflow, /GHCR_PULL_USERNAME/);
  assert.match(workflow, /GHCR_PULL_TOKEN/);
  assert.match(workflow, /docker login ghcr\.io --username/);
  assert.match(workflow, /vars\.NEXT_PUBLIC_API_URL \|\| secrets\.NEXT_PUBLIC_API_URL/);
  assert.match(workflow, /uses: [^\n]+@[0-9a-f]{40}/);
  assert.doesNotMatch(workflow, /uses: [^\n]+@v\d/);
  assert.match(workflow, /docker\/setup-buildx-action@[0-9a-f]{40}/);
  assert.match(workflow, /appleboy\/scp-action@917f8b81dfc1ccd331fef9e2d61bdc6c8be94634/);
  assert.match(workflow, /name: Build and push API image/);
  assert.match(workflow, /name: Build and push Web image/);
});

test("scope preserves product verification when a docs commit follows a cancelled main run", () => {
  const script = qualityWorkflow.match(/- name: Detect product changes[\s\S]*?        run: \|\n([\s\S]*?)\n  verify:/)?.[1].replace(/^          /gm, "");
  assert.ok(script, "quality scope script must be present");
  const dir = mkdtempSync(resolve(tmpdir(), "fluxora-ci-scope-"));
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  try {
    git("init", "-q");
    git("config", "user.email", "ci@example.invalid");
    git("config", "user.name", "CI test");
    mkdirSync(resolve(dir, "docs"));
    writeFileSync(resolve(dir, "app.js"), "old\n");
    git("add", "."); git("commit", "-qm", "baseline");
    const base = git("rev-parse", "HEAD");
    writeFileSync(resolve(dir, "app.js"), "new\n");
    git("add", "."); git("commit", "-qm", "product change");
    const product = git("rev-parse", "HEAD");
    writeFileSync(resolve(dir, "docs", "guide.md"), "docs\n");
    git("add", "."); git("commit", "-qm", "docs change");
    const docs = git("rev-parse", "HEAD");
    const run = (event, from, to) => {
      const output = resolve(dir, "output");
      writeFileSync(output, "");
      const result = spawnSync("bash", ["-c", script], { cwd: dir, encoding: "utf8", env: { ...process.env, EVENT_NAME: event, BEFORE_SHA: from, BASE_SHA: from, HEAD_SHA: to, GITHUB_OUTPUT: output } });
      return { ...result, output: readFileSync(output, "utf8") };
    };
    assert.match(run("push", product, docs).output, /run_verify=true/);
    assert.match(run("pull_request", product, docs).output, /run_verify=false/);
    assert.match(run("pull_request", base, docs).output, /run_verify=true/);
    assert.notEqual(run("pull_request", "invalid-ref", docs).status, 0);
    git("mv", "app.js", "docs/app.js"); git("commit", "-qm", "move product into docs");
    assert.match(run("pull_request", docs, git("rev-parse", "HEAD")).output, /run_verify=true/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verification and operational retention contracts avoid redundant work", () => {
  assert.match(rootPackage.scripts.verify, /build:contracts/);
  assert.match(rootPackage.scripts.verify, /test:workspaces/);
  assert.match(rootPackage.scripts.verify, /lint:workspaces/);
  assert.match(rootPackage.scripts.verify, /typecheck:workspaces/);
  assert.match(rootPackage.scripts.verify, /build:apps/);
  assert.match(deployScript, /check-disk-space\.sh/);
  assert.match(healthcheckScript, /health\/ready/);
  assert.match(retentionWorkflow, /packages: write/);
  assert.match(retentionWorkflow, /prune-ghcr-versions\.sh/);
  assert.match(pruneGhcrScript, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(pruneGhcrScript, /GHCR_KEEP_VERSIONS/);
  assert.doesNotMatch(pruneGhcrScript, /docker system prune/);
  assert.match(rootPackage.scripts.securityCheck ?? rootPackage.scripts["security:check"], /scan-tracked-secrets\.mjs/);
  assert.match(rootPackage.scripts["production:config:check"], /release-security\.test\.mjs/);
});

test("deploy cleanup retains rollback images and never prunes infrastructure", () => {
  assert.match(deployScript, /prune-application-images\.sh/);
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
  assert.doesNotMatch(deployScript, /\bpull\s*\n/);
});

test("production deployment backs up PostgreSQL before migrations", () => {
  const backupIndex = deployScript.indexOf("backup-postgres.sh");
  const migrationIndex = deployScript.indexOf("up -d migrate");
  assert.ok(backupIndex >= 0, "deploy must invoke the guarded PostgreSQL backup");
  assert.ok(migrationIndex > backupIndex, "backup must precede the migration service");
  assert.match(deployScript, /up -d --wait db redis/);
  assert.match(deployScript, /ENV_FILE=/);
});

test("production reverse proxy uses the two-domain layout", () => {
  assert.match(nginxTemplate, /server_name \$\{APP_DOMAIN\};/);
  assert.match(nginxTemplate, /server_name \$\{API_DOMAIN\};/);
  assert.match(nginxTemplate, /proxy_pass http:\/\/127\.0\.0\.1:3001;/);
  assert.match(nginxTemplate, /location \/ \{/);
  assert.match(nginxTemplate, /proxy_pass http:\/\/127\.0\.0\.1:3000;/);
  assert.match(envExample, /^NEXT_PUBLIC_API_URL=https:\/\/api\.fluxora\.io\.vn\/api\/v1$/m);
  assert.match(envExample, /^WEB_ORIGIN=https:\/\/fluxora\.io\.vn$/m);
  assert.match(envExample, /^GOOGLE_AUTH_REDIRECT_URI=https:\/\/api\.fluxora\.io\.vn\/api\/v1\/auth\/google\/callback$/m);
});
