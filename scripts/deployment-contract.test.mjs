import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { qualityCommands } from "./workspace-quality-policy.mjs";
import { classifyChange, isDocumentationOnlyPath } from "./ci-change-scope.mjs";
import { upstreamVerification } from "./ci-upstream-verification.mjs";

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

test("backup publishes only a successful dump and never overwrites an existing archive", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "fluxora-backup-contract-"));
  try {
    mkdirSync(resolve(dir, "infra"));
    mkdirSync(resolve(dir, "bin"));
    mkdirSync(resolve(dir, "backups"));
    writeFileSync(resolve(dir, "infra/docker-compose.production.yml"), "# synthetic\n");
    writeFileSync(resolve(dir, ".env.production"), "# synthetic\n");
    writeFileSync(resolve(dir, "bin/docker"), '#!/bin/sh\nprintf "synthetic dump"\n[ "${SYNTHETIC_DUMP_FAIL:-}" != 1 ]\n', { mode: 0o755 });
    const archive = resolve(dir, "backups/data.dump");
    const run = (fail = false) => spawnSync("sh", [backupPostgres], { encoding: "utf8", env: { ...process.env, APP_DIR: dir, BACKUP_DIR: resolve(dir, "backups"), BACKUP_FILE: archive, PATH: `${resolve(dir, "bin")}:${process.env.PATH}`, SYNTHETIC_DUMP_FAIL: fail ? "1" : "0" } });
    assert.notEqual(run(true).status, 0);
    assert.deepEqual(readdirSync(resolve(dir, "backups")), []);
    assert.equal(run().status, 0);
    assert.equal(readFileSync(archive, "utf8"), "synthetic dump");
    assert.equal(statSync(archive).mode & 0o777, 0o600);
    assert.notEqual(run().status, 0);
    assert.equal(readFileSync(archive, "utf8"), "synthetic dump");
    assert.deepEqual(readdirSync(resolve(dir, "backups")), ["data.dump"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CI/CD workflow keeps bounded jobs, cache, and least-privilege deploy permissions", () => {
  assert.match(qualityWorkflow, /timeout-minutes:\s*20/);
  assert.match(qualityWorkflow, /uses: actions\/cache@[0-9a-f]{40}/);
  assert.match(qualityWorkflow, /path: ~\/\.cache\/ms-playwright/);
  assert.match(qualityWorkflow, /concurrency:/);
  assert.match(qualityWorkflow, /cancel-in-progress: true/);
  assert.match(qualityWorkflow, /jobs:\n\s+scope:/);
  assert.match(qualityWorkflow, /outputs:\n\s+run_verify:/);
  assert.match(qualityWorkflow, /node scripts\/ci-change-scope\.mjs/);
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

test("scope classifies main and PR changes without dropping product work", () => {
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
    mkdirSync(resolve(dir, "scripts"));
    copyFileSync(resolve(root, "scripts/ci-change-scope.mjs"), resolve(dir, "scripts/ci-change-scope.mjs"));
    const run = (event, from, to) => {
      const output = resolve(dir, "output");
      writeFileSync(output, "");
      const result = spawnSync("bash", ["-c", script], { cwd: dir, encoding: "utf8", env: { ...process.env, EVENT_NAME: event, BEFORE_SHA: from, BASE_SHA: from, HEAD_SHA: to, GITHUB_OUTPUT: output } });
      return { ...result, output: readFileSync(output, "utf8") };
    };
    assert.match(run("push", product, docs).output, /run_verify=false/);
    assert.match(run("push", base, docs).output, /run_verify=true/);
    assert.match(run("push", docs, product).output, /run_verify=true/);
    assert.equal(classifyChange(product, docs, dir).product, false);
    assert.equal(classifyChange(base, docs, dir).product, true);
    assert.match(run("pull_request", product, docs).output, /run_verify=false/);
    assert.match(run("pull_request", base, docs).output, /run_verify=true/);
    assert.notEqual(run("pull_request", "invalid-ref", docs).status, 0);
    git("mv", "app.js", "docs/app.js"); git("commit", "-qm", "move product into docs");
    assert.match(run("pull_request", docs, git("rev-parse", "HEAD")).output, /run_verify=true/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("deployment eligibility requires the exact verified quality attempt", () => {
  const job = { name: "verify", head_sha: sha, run_attempt: 2, status: "completed", conclusion: "success" };
  assert.equal(upstreamVerification([{ jobs: [job] }], sha, 2), "verified");
  assert.equal(upstreamVerification([{ jobs: [{ ...job, conclusion: "skipped" }] }], sha, 2), "skipped");
  for (const pages of [
    [{ jobs: [] }], [{ jobs: [job, job] }], [{ jobs: [{ ...job, conclusion: "failure" }] }],
    [{ jobs: [{ ...job, conclusion: "cancelled" }] }], [{ jobs: [{ ...job, head_sha: "a".repeat(40) }] }],
    [{ jobs: [{ ...job, run_attempt: 1 }] }], [{ jobs: [{ ...job, status: "in_progress" }] }], [{}],
  ]) assert.throws(() => upstreamVerification(pages, sha, 2));
  assert.throws(() => upstreamVerification([{ jobs: [job] }], "invalid", 2));
  assert.match(workflow, /queue: max/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.head_repository\.id == github\.event\.repository\.id/);
  assert.match(workflow, /attempts\/\$UPSTREAM_ATTEMPT\/jobs/);
  assert.match(workflow, /git merge-base --is-ancestor "\$COMMIT_SHA" "\$current"/);
  assert.match(workflow, /node scripts\/ci-change-scope\.mjs "\$COMMIT_SHA" "\$current"/);
  assert.match(workflow, /needs: qualify/);
  assert.match(qualityWorkflow, /github\.event\.pull_request\.number \|\| github\.sha/);
});

test("documentation classification is deliberately narrow", () => {
  for (const path of ["README.md", "docs/guide.md", ".agent/tasks/task.md", "LICENSE"]) assert.equal(isDocumentationOnlyPath(path), true, path);
  for (const path of ["apps/web/README.md", "docs/data.json", ".github/workflows/quality.yml", ".gitignore", "package-lock.json"]) assert.equal(isDocumentationOnlyPath(path), false, path);
});

test("verification and operational retention contracts avoid redundant work", () => {
  assert.deepEqual(qualityCommands({ typecheck: "tsc --noEmit", lint: "tsc --noEmit" }), ["typecheck"]);
  assert.deepEqual(qualityCommands({ typecheck: "tsc --noEmit", lint: "eslint ." }), ["typecheck", "lint"]);
  assert.deepEqual(qualityCommands({ typecheck: "tsc", lint: "tsc", prelint: "node prepare.js" }), ["typecheck", "lint"]);
  assert.deepEqual(qualityCommands({ lint: "eslint ." }), ["lint"]);
  assert.match(rootPackage.scripts.verify, /build:contracts/);
  assert.match(rootPackage.scripts.verify, /test:workspaces/);
  assert.match(rootPackage.scripts.verify, /quality:workspaces/);
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
  const migrationIndex = deployScript.indexOf("up -d api worker web");
  assert.ok(backupIndex >= 0, "deploy must invoke the guarded PostgreSQL backup");
  assert.ok(migrationIndex > backupIndex, "backup must precede the migration service");
  assert.doesNotMatch(deployScript, /up -d migrate/);
  for (const service of ["api", "worker"]) {
    const section = compose.match(new RegExp(`^  ${service}:\\n([\\s\\S]*?)(?=^  [a-z]+:|^networks:)`, "m"))?.[1];
    assert.ok(section, `${service} must exist in the Compose contract`);
    assert.match(section, /depends_on:\s*\n\s+migrate:\s*\n\s+condition: service_completed_successfully/);
  }
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
