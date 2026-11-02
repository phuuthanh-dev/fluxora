import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import pg from "pg";

const root = resolve(import.meta.dirname, "..");
const sha = "0123456789abcdef0123456789abcdef01234567";

function exercise({ state = "nx", label = "nx-v1", databaseFailure = false, inspectFailure = false, locked = false, stopFailure = false, missingWorker = false, workerImageId = "target-image-id", drainState = "exited 0 false", legacyPending = "clear", afterDrain = legacyPending } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "fluxora-rollback-test-"));
  try {
    const scripts = join(dir, "infra/scripts");
    mkdirSync(scripts, { recursive: true });
    const log = join(dir, "calls");
    const envFile = join(dir, "production.env");
    writeFileSync(envFile, "# synthetic test settings\n");
    writeFileSync(join(dir, "infra/docker-compose.production.yml"), "# synthetic compose\n");
    copyFileSync(join(root, "infra/scripts/validate-image-tag.sh"), join(scripts, "validate-image-tag.sh"));
    copyFileSync(join(root, "infra/scripts/release-lock.sh"), join(scripts, "release-lock.sh"));
    chmodSync(join(scripts, "validate-image-tag.sh"), 0o755);
    if (locked) mkdirSync(join(dir, ".fluxora-release.lock"));
    writeFileSync(log, "");
    writeFileSync(join(scripts, "healthcheck.sh"), '#!/bin/sh\nprintf "%s\\n" health >> "$CALL_LOG"\n');
    chmodSync(join(scripts, "healthcheck.sh"), 0o755);
    const bin = join(dir, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "docker"), `#!/bin/sh
printf '%s\n' "$*" >> "$CALL_LOG"
case "$*" in
  *'exec -T db'*) [ "$DB_FAIL" = 1 ] && exit 1; case "$*" in *'to_jsonb(e)'*) if [ -f "$DRAINED_FILE" ]; then printf '%s\n' "$AFTER_DRAIN"; else printf '%s\n' "$LEGACY_PENDING"; fi ;; *) printf '%s\n' "$DB_STATE" ;; esac ;;
  'image inspect --format {{.Id}} '*) printf '%s\n' target-image-id ;;
  'image inspect '*) [ "$INSPECT_FAIL" = 1 ] && exit 1; printf '%s\n' "$IMAGE_LABEL" ;;
  *'stop --timeout -1 worker'*) [ "$STOP_FAIL" = 1 ] && exit 1; touch "$DRAINED_FILE" ;;
  *'up -d api worker web'*) touch "$REPLACED_FILE" ;;
  *'ps -q worker'*) [ "$MISSING_WORKER" = 1 ] && [ -f "$REPLACED_FILE" ] || printf '%s\n' worker-1 ;;
  'inspect --format {{.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled}} '*) printf '%s\n' "$DRAIN_STATE" ;;
  'inspect --format {{.State.Status}} '*) printf '%s\n' running ;;
  'inspect --format {{.Config.Image}} '*) printf '%s:%s\n' "$API_IMAGE" "$IMAGE_TAG" ;;
  'inspect --format {{.Image}} '*) printf '%s\n' "$WORKER_IMAGE_ID" ;;
esac
exit 0
`);
    chmodSync(join(bin, "docker"), 0o755);
    const result = spawnSync("sh", [join(root, "infra/scripts/rollback.sh"), sha], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, APP_DIR: dir, ENV_FILE: envFile, API_IMAGE: "synthetic-api", WEB_IMAGE: "synthetic-web", IMAGE_TAG: sha, CALL_LOG: log, DRAINED_FILE: join(dir, "drained"), REPLACED_FILE: join(dir, "replaced"), DB_STATE: state, IMAGE_LABEL: label, DB_FAIL: databaseFailure ? "1" : "0", INSPECT_FAIL: inspectFailure ? "1" : "0", STOP_FAIL: stopFailure ? "1" : "0", MISSING_WORKER: missingWorker ? "1" : "0", WORKER_IMAGE_ID: workerImageId, DRAIN_STATE: drainState, LEGACY_PENDING: legacyPending, AFTER_DRAIN: afterDrain },
    });
    return { result, calls: readFileSync(log, "utf8"), lockStillPresent: existsSync(join(dir, ".fluxora-release.lock")) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("NX database refuses an uncertified old image before starting services", () => {
  const { result, calls } = exercise({ label: "<no value>" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not certified/);
  assert.doesNotMatch(calls, /up -d api worker web|health/);
});

test("NX database permits a certified image and checks health", () => {
  const { result, calls } = exercise();
  assert.equal(result.status, 0, result.stderr);
  assert.match(calls, /image inspect/);
  assert.match(calls, /up -d api worker web/);
  assert.match(calls, /health/);
});

test("the API runtime image declares the compatibility contract it implements", () => {
  const dockerfile = readFileSync(join(root, "apps/api/Dockerfile"), "utf8");
  const runtime = dockerfile.split("AS runtime", 2)[1] ?? "";
  assert.match(runtime, /LABEL io\.fluxora\.execution-compatibility="nx-v1"/);
});

test("legacy database permits its existing unlabelled rollback image", () => {
  const { result, calls } = exercise({ state: "legacy", label: "<no value>" });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(calls, /io\.fluxora\.execution-compatibility/);
  assert.match(calls, /image inspect --format \{\{\.Id\}\}/);
  assert.match(calls, /up -d api worker web/);
});

test("rollback fails closed when database state or image compatibility cannot be established", () => {
  for (const options of [{ databaseFailure: true }, { state: "unexpected" }, { inspectFailure: true }]) {
    const { result, calls } = exercise(options);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(calls, /up -d api worker web|health/);
  }
});

test("rollback retains its lock when worker drain or replacement is uncertain", () => {
  for (const options of [{ stopFailure: true }, { drainState: "exited 1 false" }, { drainState: "exited 0 true" }, { afterDrain: "ambiguous" }, { missingWorker: true }, { workerImageId: "stale-image-id" }]) {
    const { result, calls, lockStillPresent } = exercise(options);
    assert.notEqual(result.status, 0);
    assert.equal(lockStillPresent, true);
    if (options.stopFailure || options.drainState || options.afterDrain) assert.doesNotMatch(calls, /up -d api worker web|start worker/);
  }
});

test("rollback refuses ambiguous continuations before stopping workers", () => {
  const { result, calls, lockStillPresent } = exercise({ legacyPending: "ambiguous" });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(calls, /stop --timeout|up -d api worker web/);
  assert.equal(lockStillPresent, false);
});

test("rollback cannot overlap another release or remove its lock", () => {
  const { result, calls, lockStillPresent } = exercise({ locked: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /holds the lock/);
  assert.equal(calls, "");
  assert.equal(lockStillPresent, true);
});

test("deploy and rollback use the same lock and release it after rollback", () => {
  for (const name of ["deploy.sh", "rollback.sh"]) {
    const source = readFileSync(join(root, "infra/scripts", name), "utf8");
    assert.match(source, /release-lock\.sh/);
    assert.match(source, /acquire_release_lock "\$app_dir"/);
  }
  assert.equal(exercise().lockStillPresent, false);
  assert.equal(exercise({ label: "<no value>" }).lockStillPresent, false);
});

test("NX migration query detects applied, partially started and marked-rolled-back migrations", { skip: process.env.FLUXORA_ROLLBACK_INTEGRATION !== "1" }, async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(url.pathname)) throw new Error("Rollback test requires a disposable local fluxora_*test* database.");
  const script = readFileSync(join(root, "infra/scripts/rollback.sh"), "utf8");
  const expression = script.match(/^migration_sql="(.*)"$/m)?.[1];
  assert.ok(expression);
  const sql = expression.replaceAll('\\"', '"');
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query('CREATE TEMP TABLE "_prisma_migrations" (migration_name text, rolled_back_at timestamptz) ON COMMIT DROP');
    assert.equal((await client.query(sql)).rows[0].case, "legacy");
    await client.query('INSERT INTO "_prisma_migrations" VALUES ($1, NULL)', ["20261103140000_approval_continuation"]);
    assert.equal((await client.query(sql)).rows[0].case, "nx");
    await client.query('UPDATE "_prisma_migrations" SET rolled_back_at = now()');
    assert.equal((await client.query(sql)).rows[0].case, "nx");
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
