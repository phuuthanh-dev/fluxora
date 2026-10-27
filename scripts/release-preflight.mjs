import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function read(relativePath) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function result(category, status, name, detail) {
  return { category, status, name, detail };
}

function requirePatterns(category, name, source, patterns) {
  const missing = patterns.filter(({ pattern }) => !pattern.test(source)).map(({ label }) => label);
  return missing.length === 0
    ? result(category, "pass", name, `Contract includes ${patterns.map(({ label }) => label).join(", ")}.`)
    : result(category, "blocked", name, `Missing contract names: ${missing.join(", ")}.`);
}

export function runReleasePreflight() {
  const envExample = read("infra/.env.production.example");
  const compose = read("infra/docker-compose.production.yml");
  const healthcheck = read("infra/scripts/healthcheck.sh");
  const rollback = read("infra/scripts/rollback.sh");
  const backup = read("infra/scripts/backup-postgres.sh");
  const restore = read("infra/scripts/restore-postgres.sh");
  const nginx = read("infra/nginx/workflow-automation.conf.template");
  const deployWorkflow = read(".github/workflows/deploy-production.yml");
  const qualityWorkflow = read(".github/workflows/quality.yml");
  const redaction = read("apps/api/src/execution/redaction.ts");
  const packageJson = read("package.json");
  const secretScanner = read("scripts/scan-tracked-secrets.mjs");
  const envValidator = read("scripts/validate-production-env.mjs");
  const migrationRoot = resolve(root, "apps/api/prisma/migrations");
  const migrations = readdirSync(migrationRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(resolve(migrationRoot, entry.name, "migration.sql")));

  const checks = [
    requirePatterns("runtime", "Production environment names", envExample, [
      { label: "NODE_ENV=production", pattern: /^NODE_ENV=production$/m },
      { label: "EXECUTION_QUEUE_MODE=redis", pattern: /^EXECUTION_QUEUE_MODE=redis$/m },
      { label: "EXECUTION_QUEUE_NAME", pattern: /^EXECUTION_QUEUE_NAME=[a-zA-Z0-9_-]+$/m },
      { label: "EXECUTION_EVENTS_CHANNEL", pattern: /^EXECUTION_EVENTS_CHANNEL=[a-zA-Z0-9:_-]+$/m },
      { label: "APP_ENCRYPTION_KEY", pattern: /^APP_ENCRYPTION_KEY=/m },
      { label: "WEB_ORIGIN=https", pattern: /^WEB_ORIGIN=https:\/\//m },
      { label: "NEXT_PUBLIC_API_URL=https", pattern: /^NEXT_PUBLIC_API_URL=https:\/\/.+\/api\/v1$/m },
    ]),
    migrations.length > 0 && /prisma.+migrate.+deploy|migrate.+deploy.+prisma/s.test(compose)
      ? result("database", "pass", "Migration contract", `${migrations.length} ordered migrations and a one-shot migrate service are present.`)
      : result("database", "blocked", "Migration contract", "Prisma migrations or the production migrate service are missing."),
    requirePatterns("health", "Liveness and dependency readiness", healthcheck, [
      { label: "/api/v1/health", pattern: /\/api\/v1\/health/ },
      { label: "/api/v1/health/ready", pattern: /\/api\/v1\/health\/ready/ },
      { label: "web root", pattern: /127\.0\.0\.1:3000\// },
    ]),
    requirePatterns("recovery", "Backup contract", backup, [
      { label: "pg_dump custom format", pattern: /pg_dump.+--format=custom/s },
      { label: "restricted backup permissions", pattern: /chmod 600/ },
      { label: "production compose", pattern: /compose_file[\s\S]+docker compose/ },
    ]),
    requirePatterns("recovery", "Guarded restore contract", restore, [
      { label: "explicit confirmation", pattern: /CONFIRM_RESTORE.*RESTORE/ },
      { label: "pg_restore", pattern: /pg_restore/ },
      { label: "backup path validation", pattern: /\[ ! -f "\$backup_file" \]/ },
    ]),
    requirePatterns("recovery", "Immutable rollback contract", rollback, [
      { label: "image-tag validation", pattern: /validate-image-tag\.sh/ },
      { label: "health check", pattern: /healthcheck\.sh/ },
      { label: "api/worker/web only", pattern: /up -d api worker web/ },
    ]),
    requirePatterns("routing", "Domain and proxy contract", `${envExample}\n${nginx}`, [
      { label: "web domain", pattern: /fluxora\.io\.vn/ },
      { label: "API domain", pattern: /api\.fluxora\.io\.vn/ },
      { label: "loopback web upstream", pattern: /127\.0\.0\.1:3000/ },
      { label: "loopback API upstream", pattern: /127\.0\.0\.1:3001/ },
    ]),
    requirePatterns("identity", "OAuth callback names and HTTPS shapes", envExample, [
      { label: "Google credential callback", pattern: /^GOOGLE_REDIRECT_URI=https:\/\/.+\/oauth\/google\/callback$/m },
      { label: "Google login callback", pattern: /^GOOGLE_AUTH_REDIRECT_URI=https:\/\/.+\/auth\/google\/callback$/m },
      { label: "GitHub login callback", pattern: /^GITHUB_AUTH_REDIRECT_URI=https:\/\/.+\/auth\/github\/callback$/m },
      { label: "Steam OpenID return URI", pattern: /^STEAM_OPENID_RETURN_URI=https:\/\/.+\/auth\/steam\/callback$/m },
      { label: "Steam HTTPS realm", pattern: /^STEAM_OPENID_REALM=https:\/\//m },
    ]),
    requirePatterns("security", "Bounded logs and execution redaction", `${compose}\n${redaction}`, [
      { label: "rotated JSON logs", pattern: /max-size:\s*10m[\s\S]+max-file:\s*"3"/ },
      { label: "sensitive-key redaction", pattern: /sensitiveKey/ },
      { label: "provider URL redaction", pattern: /redactTelegramTokenInUrl/ },
    ]),
    requirePatterns("security", "Release security gate", `${packageJson}\n${qualityWorkflow}\n${secretScanner}\n${envValidator}`, [
      { label: "tracked secret scan", pattern: /scan-tracked-secrets\.mjs/ },
      { label: "production env validator", pattern: /validate-production-env\.mjs/ },
      { label: "npm high-severity audit", pattern: /npm audit --omit=dev --audit-level=high/ },
      { label: "non-printing validation", pattern: /secret values were not printed|secretValuesRead/ },
    ]),
    requirePatterns("automation", "GitHub Actions release contract", `${deployWorkflow}\n${qualityWorkflow}`, [
      { label: "VPS_HOST secret", pattern: /secrets\.VPS_HOST/ },
      { label: "VPS_USER secret", pattern: /secrets\.VPS_USER/ },
      { label: "VPS_SSH_KEY secret", pattern: /secrets\.VPS_SSH_KEY/ },
      { label: "GHCR pull secret", pattern: /secrets\.GHCR_PULL_TOKEN/ },
      { label: "public API repository variable", pattern: /vars\.NEXT_PUBLIC_API_URL/ },
      { label: "quality Redis service", pattern: /services:[\s\S]+redis:/ },
      { label: "pinned actions", pattern: /uses: [^\n]+@[0-9a-f]{40}/ },
    ]),
    result("operator_evidence", "operator", "DNS and TLS evidence", "Confirm both A records, valid certificates, Nginx config test, and HTTPS responses on the target VPS."),
    result("operator_evidence", "operator", "Recovery drill evidence", "Create an encrypted/off-host backup, restore it into an isolated database, and record the tested immutable rollback SHA."),
    result("user_input", "user_input", "OAuth provider configuration", "The owner must configure matching Google/GitHub/Steam provider settings and GitHub/VPS secrets without sharing their values in reports."),
    result("user_input", "user_input", "First live-provider test", "The owner must explicitly approve one controlled live run and verify its external side effect."),
  ];

  return {
    schema: "fluxora.release-preflight.v1",
    generatedAt: new Date().toISOString(),
    mode: "repository-contract-only",
    secretValuesRead: false,
    externalRequestsMade: false,
    verdict: checks.some((check) => check.status === "blocked") ? "NO_GO" : "CONDITIONAL_GO",
    checks,
  };
}

function printHuman(report) {
  console.log(`Fluxora release preflight: ${report.verdict}`);
  console.log("Read-only repository contract audit; no .env values or external services were accessed.\n");
  for (const check of report.checks) {
    console.log(`[${check.status.toUpperCase()}] ${check.category} — ${check.name}: ${check.detail}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = runReleasePreflight();
  if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  if (report.verdict === "NO_GO") process.exitCode = 1;
}
