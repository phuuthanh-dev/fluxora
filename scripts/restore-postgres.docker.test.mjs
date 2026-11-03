import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "..");

// Explicit opt-in: this test creates and destroys only its own uniquely named
// Compose project and synthetic database. It never connects to app databases.
test("restore refuses a populated target and restores an isolated empty target", { skip: process.env.FLUXORA_RESTORE_DOCKER_TEST !== "1", timeout: 120_000 }, () => {
  const project = `fluxorarestore${randomBytes(8).toString("hex")}`;
  const dir = mkdtempSync(resolve(tmpdir(), "fluxora-restore-docker-"));
  const infra = resolve(dir, "infra");
  const envFile = resolve(dir, ".env.production");
  const composeFile = resolve(infra, "docker-compose.production.yml");
  const backup = resolve(dir, "backups/fixture.dump");
  const compose = (...args) => execFileSync("docker", ["compose", "--project-name", project, "--env-file", envFile, "-f", composeFile, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const sql = (statement) => compose("exec", "-T", "db", "psql", "-X", "-U", "fixture", "-d", "fixture", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", statement).trim();
  const scriptEnv = { ...process.env, APP_DIR: dir, ENV_FILE: envFile, COMPOSE_PROJECT_NAME: project, BACKUP_DIR: resolve(dir, "backups"), BACKUP_FILE: backup, CONFIRM_RESTORE: "RESTORE" };
  const restore = () => spawnSync("sh", [resolve(root, "infra/scripts/restore-postgres.sh"), backup], { env: scriptEnv, encoding: "utf8" });

  mkdirSync(infra);
  writeFileSync(envFile, "# synthetic fixture only\n", { mode: 0o600 });
  writeFileSync(composeFile, `services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: fixture
      POSTGRES_PASSWORD: fixture-only
      POSTGRES_DB: fixture
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U fixture -d fixture"]
      interval: 1s
      timeout: 2s
      retries: 30
  api:
    image: postgres:16-alpine
    profiles: [disabled]
  worker:
    image: postgres:16-alpine
    profiles: [disabled]
`);
  let cleanupSucceeded = false;
  try {
    compose("up", "-d", "--wait", "db");
    sql("CREATE TABLE snapshot_row (value text NOT NULL); INSERT INTO snapshot_row VALUES ('fixture');");
    execFileSync("sh", [resolve(root, "infra/scripts/backup-postgres.sh")], { env: scriptEnv, stdio: ["ignore", "pipe", "pipe"] });
    assert.ok(readFileSync(backup).length > 0);
    sql("DROP TABLE snapshot_row; CREATE TABLE created_after_backup (value text NOT NULL); INSERT INTO created_after_backup VALUES ('preserve');");
    const refused = restore();
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /target is not clear/i);
    assert.equal(sql("SELECT value FROM created_after_backup"), "preserve");
    assert.equal(existsSync(resolve(dir, ".fluxora-release.lock")), false);
    sql("DROP TABLE created_after_backup");

    // An apparently table-free database can still contain schema objects that
    // pg_restore --clean will not remove if absent from the archive.
    sql("CREATE SCHEMA fixture_extra; CREATE FUNCTION public.fixture_function() RETURNS integer LANGUAGE SQL AS 'SELECT 7';");
    const refusedObjects = restore();
    assert.notEqual(refusedObjects.status, 0);
    assert.match(refusedObjects.stderr, /target is not clear/i);
    assert.equal(sql("SELECT public.fixture_function()"), "7");
    assert.equal(sql("SELECT count(*) FROM pg_namespace WHERE nspname = 'fixture_extra'"), "1");
    sql("DROP FUNCTION public.fixture_function(); DROP SCHEMA fixture_extra");

    const restored = restore();
    assert.equal(restored.status, 0, restored.stderr);
    assert.equal(sql("SELECT value FROM snapshot_row"), "fixture");
    assert.equal(existsSync(resolve(dir, ".fluxora-release.lock")), false);
  } finally {
    // The project name and compose file are generated above, with no external
    // volumes or host binds. Never target the application's Compose project.
    try { compose("down", "--volumes", "--remove-orphans"); cleanupSucceeded = true; }
    finally { if (cleanupSucceeded) rmSync(dir, { recursive: true, force: true }); }
  }
});
