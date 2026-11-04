import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import pg from "pg";

const root = resolve(import.meta.dirname, "..");
const sha = "0123456789abcdef0123456789abcdef01234567";
const legacyId = `sha256:${"a".repeat(64)}`;

function exercise({ target = "nx-v1", fleet = "nx-v1", apiLabel = fleet, workerLabel = fleet, targetDrain = "v1", fleetDrain = "v1", containerState = "running", apiState = containerState, workerState = containerState, fleetIds = "api-1 worker-1", runningApis = "api-1", runningWorkers = "worker-1", fail = "", restartFailure = "", legacyPending = "clear", afterDrain = legacyPending, runningState = "clear", dbRunning = true, useDefaultImages = false, retagged = false, staged = false, composeMismatch = false, missingRequired = false, cutoverId = "", actualLegacyId = "", schemaState = "legacy", idleState = "clear", idleAfter = idleState, queueState = "0", queueAfter = queueState, skipBackup = "", legacyExit = "exited 143 false" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "fluxora-deploy-test-"));
  try {
    const scripts = join(dir, "infra/scripts");
    mkdirSync(scripts, { recursive: true });
    const log = join(dir, "calls");
    const envFile = join(dir, "production.env");
    writeFileSync(log, "");
    writeFileSync(envFile, "# synthetic test settings\n");
    writeFileSync(join(dir, "infra/docker-compose.production.yml"), "# synthetic compose\n");
    for (const name of ["validate-image-tag.sh", "release-lock.sh"]) copyFileSync(join(root, "infra/scripts", name), join(scripts, name));
    chmodSync(join(scripts, "validate-image-tag.sh"), 0o755);
    for (const name of ["check-disk-space.sh", "backup-postgres.sh", "healthcheck.sh", "prune-application-images.sh"]) {
      writeFileSync(join(scripts, name), `#!/bin/sh\nprintf '%s\\n' '${name}' >> "$CALL_LOG"\n[ "$FAIL_AT" = '${name}' ] && exit 1\nif [ "$FAIL_AT" = compose-after-backup ] && [ '${name}' = backup-postgres.sh ]; then printf '%s\\n' '# changed active compose' > "$APP_DIR/infra/docker-compose.production.yml"; fi\nexit 0\n`);
      chmodSync(join(scripts, name), 0o755);
    }
    const bundle = join(dir, "incoming");
    if (staged) {
      const incomingScripts = join(bundle, "infra/scripts");
      mkdirSync(incomingScripts, { recursive: true });
      writeFileSync(join(bundle, "infra/docker-compose.production.yml"), composeMismatch ? "# changed compose\n" : "# synthetic compose\n");
      for (const name of ["validate-image-tag.sh", "release-lock.sh", "check-disk-space.sh", "backup-postgres.sh", "healthcheck.sh", "prune-application-images.sh"]) copyFileSync(join(scripts, name), join(incomingScripts, name));
      for (const name of ["rollback.sh", "deploy.sh", "restore-postgres.sh"]) {
        writeFileSync(join(scripts, name), `# old ${name}\n`);
        if (!(missingRequired && name === "restore-postgres.sh")) writeFileSync(join(incomingScripts, name), `# staged ${name}\n`);
      }
    }
    const bin = join(dir, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "docker"), `#!/bin/sh
if [ "$1" = compose ] && { [ "$API_IMAGE" != "$EXPECTED_API_IMAGE" ] || [ "$WEB_IMAGE" != "$EXPECTED_WEB_IMAGE" ] || [ "$IMAGE_TAG" != "$EXPECTED_TAG" ]; }; then
  printf '%s\\n' 'Compose received inconsistent image settings' >&2
  exit 1
fi
printf '%s\n' "$*" >> "$CALL_LOG"
case "$*" in
  *'ps -aq api') [ "$FAIL_AT" = fleet ] && exit 1; for item in $FLEET_IDS; do case "$item" in api-*) printf '%s\n' "$item";; esac; done ;;
  *'ps -aq worker') [ "$FAIL_AT" = fleet ] && exit 1; for item in $FLEET_IDS; do case "$item" in worker-*) printf '%s\n' "$item";; esac; done ;;
  *'ps -q db'*) [ "$DB_RUNNING" = 1 ] && printf '%s\n' db-1 ;;
  *'ps -q api'*) if [ -f "$REPLACED_FILE" ]; then [ "$FAIL_AT" = api-missing ] || printf '%s\n' api-1; else printf '%s\n' "$RUNNING_APIS"; fi ;;
  *'ps -q worker'*) if [ -f "$REPLACED_FILE" ]; then [ "$FAIL_AT" = worker-missing ] || printf '%s\n' worker-1; else printf '%s\n' "$RUNNING_WORKERS"; fi ;;
  *'stop --timeout -1 api'*) [ "$FAIL_AT" = api-stop ] && exit 1 ;;
  *'stop --timeout -1 worker'*) [ "$FAIL_AT" = stop ] && exit 1; touch "$DRAINED_FILE" ;;
  'exec api-'*' node -e '*|'exec worker-'*' node -e '*) [ "$FAIL_AT" = legacy-env ] && exit 1 ;;
  'start '*) [ "$RESTART_FAILURE" = start ] && exit 1; touch "$RESTARTED_FILE" ;;
  *'up -d --wait db redis'*) [ "$FAIL_AT" = dependencies ] && exit 1 ;;
  *'exec -T db'*) case "$*" in *'finished_at IS NULL'*) printf '%s\n' "$SCHEMA_STATE" ;; *'ApprovalRequest'*) if [ -f "$DRAINED_FILE" ]; then printf '%s\n' "$IDLE_AFTER"; else printf '%s\n' "$IDLE_STATE"; fi ;; *"status = 'RUNNING'"*) [ "$FAIL_AT" = running-query ] && exit 1; printf '%s\n' "$RUNNING_STATE" ;; *) [ "$FAIL_AT" = legacy-query ] && exit 1; if [ -f "$DRAINED_FILE" ]; then printf '%s\n' "$AFTER_DRAIN"; else printf '%s\n' "$LEGACY_PENDING"; fi ;; esac ;;
  *'exec -T redis'*) if [ -f "$DRAINED_FILE" ]; then printf '%s\n' "$QUEUE_AFTER"; else printf '%s\n' "$QUEUE_STATE"; fi ;;
  *'up -d api worker web'*) [ "$FAIL_AT" = migrate ] && exit 1; touch "$REPLACED_FILE" ;;
  'inspect --format {{.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled}} '*)
    for last do :; done
    case "$last:$FAIL_AT" in api-*:api-inspect) exit 1 ;; api-*:api-error) printf '%s\n' 'exited 1 false'; exit 0 ;; api-*:api-oom) printf '%s\n' 'exited 0 true'; exit 0 ;; api-*:*) if [ -n "$ACTUAL_LEGACY_ID" ]; then printf '%s\n' "$LEGACY_EXIT"; else printf '%s\n' 'exited 0 false'; fi; exit 0 ;; esac
    [ "$FAIL_AT" = drain-inspect ] && exit 1
    case "$FAIL_AT" in drain-error) printf '%s\n' 'exited 1 false' ;; drain-oom) printf '%s\n' 'exited 0 true' ;; *) printf '%s\n' 'exited 0 false' ;; esac ;;
  'inspect --format {{.State.Status}} '*)
    [ "$FAIL_AT" = state ] && exit 1; for last do :; done
    if [ -f "$RESTARTED_FILE" ]; then [ "$RESTART_FAILURE" = state ] && printf '%s\n' exited || printf '%s\n' running
    elif [ -f "$REPLACED_FILE" ]; then case "$last:$FAIL_AT" in api-*:api-state|worker-*:worker-state) printf '%s\n' exited ;; *) printf '%s\n' running ;; esac
    elif [ "$last" = api-1 ]; then printf '%s\n' "$API_STATE"; else printf '%s\n' "$WORKER_STATE"; fi ;;
  'inspect --format {{.Config.Image}} '*)
    [ "$FAIL_AT" = image ] && exit 1; for last do :; done
    if [ -f "$REPLACED_FILE" ]; then printf '%s:%s\n' "$API_IMAGE" "$IMAGE_TAG"; elif [ "$RETAGGED" = 1 ]; then printf '%s\n' "$last-retagged"; else printf '%s\n' "$last-image"; fi ;;
  'inspect --format {{.Image}} '*)
    [ "$FAIL_AT" = image ] && exit 1; for last do :; done
    if [ -f "$REPLACED_FILE" ]; then case "$last:$FAIL_AT" in api-*:api-image-id|worker-*:worker-image-id) printf '%s\n' stale-image-id ;; *) printf '%s\n' target-image-id ;; esac; elif [ -n "$ACTUAL_LEGACY_ID" ]; then printf '%s\n' "$ACTUAL_LEGACY_ID"; else printf '%s\n' "$last-image"; fi ;;
  'image inspect --format {{.Id}} '*)
    [ "$FAIL_AT" = target-image-id ] && exit 1; printf '%s\n' target-image-id ;;
  *'image inspect --format {{ index .Config.Labels "io.fluxora.graceful-drain" }}'*)
    for last do :; done
    case "$last" in api-*-image|worker-*-image) printf '%s\n' "$FLEET_DRAIN" ;; *) printf '%s\n' "$TARGET_DRAIN" ;; esac ;;
  'image inspect '*)
    for last do :; done
    case "$last" in
      sha256:*) printf '%s\n' "$API_LABEL" ;;
      api-1-image) [ "$FAIL_AT" = old-label ] && exit 1; printf '%s\n' "$API_LABEL" ;;
      worker-1-image) [ "$FAIL_AT" = old-label ] && exit 1; printf '%s\n' "$WORKER_LABEL" ;;
      *-retagged) printf '%s\n' nx-v1 ;;
      *) [ "$FAIL_AT" = target-label ] && exit 1; printf '%s\n' "$TARGET_LABEL" ;;
    esac ;;
esac
exit 0
`);
    chmodSync(join(bin, "docker"), 0o755);
    writeFileSync(join(bin, "mv"), '#!/bin/sh\n[ -d "$APP_DIR/.fluxora-release.lock" ] || { printf "%s\\n" "promotion without lock" >&2; exit 1; }\ncase "$*" in *rollback.sh) [ "$FAIL_AT" = promotion ] && exit 1; if [ "$FAIL_AT" = signal-promotion ]; then kill -TERM "$PPID"; exit 0; fi ;; esac\nexec /bin/mv "$@"\n');
    chmodSync(join(bin, "mv"), 0o755);
    const result = spawnSync("sh", [join(root, "infra/scripts/deploy.sh")], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, APP_DIR: dir, RELEASE_BUNDLE: staged ? bundle : dir, ENV_FILE: envFile, IMAGE_TAG: sha, API_IMAGE: useDefaultImages ? "" : "synthetic-api", WEB_IMAGE: useDefaultImages ? "" : "synthetic-web", EXPECTED_API_IMAGE: useDefaultImages ? "ghcr.io/phuuthanh-dev/workflow-automation-api" : "synthetic-api", EXPECTED_WEB_IMAGE: useDefaultImages ? "ghcr.io/phuuthanh-dev/workflow-automation-web" : "synthetic-web", EXPECTED_TAG: sha, CALL_LOG: log, DRAINED_FILE: join(dir, "drained"), REPLACED_FILE: join(dir, "replaced"), RESTARTED_FILE: join(dir, "restarted"), TARGET_LABEL: target, API_LABEL: apiLabel, WORKER_LABEL: workerLabel, TARGET_DRAIN: targetDrain, FLEET_DRAIN: fleetDrain, API_STATE: apiState, WORKER_STATE: workerState, FLEET_IDS: fleetIds, RUNNING_APIS: runningApis, RUNNING_WORKERS: runningWorkers, FAIL_AT: fail, RESTART_FAILURE: restartFailure, LEGACY_PENDING: legacyPending, AFTER_DRAIN: afterDrain, RUNNING_STATE: runningState, DB_RUNNING: dbRunning ? "1" : "0", RETAGGED: retagged ? "1" : "0", FLUXORA_LEGACY_CUTOVER_IMAGE_ID: cutoverId, FLUXORA_SKIP_LEGACY_BACKUP: skipBackup, ACTUAL_LEGACY_ID: actualLegacyId, SCHEMA_STATE: schemaState, IDLE_STATE: idleState, IDLE_AFTER: idleAfter, QUEUE_STATE: queueState, QUEUE_AFTER: queueAfter, LEGACY_EXIT: legacyExit },
    });
    const backups = join(dir, ".release-tooling-backups");
    const backupEntries = existsSync(backups) ? readdirSync(backups) : [];
    return { result, calls: readFileSync(log, "utf8"), lockStillPresent: existsSync(join(dir, ".fluxora-release.lock")), activeRollback: staged ? readFileSync(join(scripts, "rollback.sh"), "utf8") : "", backupRollback: backupEntries.length ? readFileSync(join(backups, backupEntries[0], "rollback.sh"), "utf8") : "", backupCount: backupEntries.length };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("production workflow stages a unique bundle and executes from it", () => {
  const workflow = readFileSync(join(root, ".github/workflows/deploy-production.yml"), "utf8");
  assert.match(workflow, /target: "\/opt\/workflow-automation\/\.incoming\/\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}"/);
  assert.match(workflow, /RELEASE_BUNDLE=.*sh "\$RELEASE_BUNDLE\/infra\/scripts\/deploy\.sh"/);
  assert.doesNotMatch(workflow, /target: "\/opt\/workflow-automation"/);
  assert.match(workflow, /vars\.FLUXORA_LEGACY_CUTOVER_IMAGE_ID/);
  assert.match(workflow, /vars\.FLUXORA_SKIP_LEGACY_BACKUP/);
  assert.match(workflow, /envs:.*FLUXORA_LEGACY_CUTOVER_IMAGE_ID.*FLUXORA_SKIP_LEGACY_BACKUP/);
});

test("staged release preserves active scripts when compatibility or Compose checks fail", () => {
  for (const options of [{ fleet: "<no value>" }, { fail: "fleet" }, { legacyPending: "ambiguous" }, { composeMismatch: true }, { missingRequired: true }]) {
    const { result, calls, activeRollback, backupCount } = exercise({ ...options, staged: true });
    assert.notEqual(result.status, 0);
    assert.equal(activeRollback, "# old rollback.sh\n");
    assert.equal(backupCount, 0);
    assert.doesNotMatch(calls, /stop --timeout|up -d api worker web/);
  }
});

test("a Compose change before migration retains the lock and does not migrate", () => {
  const { result, calls, lockStillPresent } = exercise({ staged: true, fail: "compose-after-backup" });
  assert.notEqual(result.status, 0);
  assert.equal(lockStillPresent, true);
  assert.match(calls, /stop --timeout -1 worker/);
  assert.doesNotMatch(calls, /up -d api worker web/);
});

test("staged release backs up and promotes tooling under the release lock before migration", () => {
  const { result, calls, activeRollback, backupRollback, lockStillPresent } = exercise({ staged: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(activeRollback, "# staged rollback.sh\n");
  assert.equal(backupRollback, "# old rollback.sh\n");
  assert.equal(lockStillPresent, false);
  assert.match(calls, /up -d api worker web/);
});

test("partial tooling promotion retains its lock and never starts migration", () => {
  const { result, calls, activeRollback, backupRollback, lockStillPresent } = exercise({ staged: true, fail: "promotion" });
  assert.notEqual(result.status, 0);
  assert.equal(activeRollback, "# old rollback.sh\n");
  assert.equal(backupRollback, "# old rollback.sh\n");
  assert.equal(lockStillPresent, true);
  assert.doesNotMatch(calls, /stop --timeout|up -d api worker web/);
});

test("SIGTERM during tooling promotion leaves the lock and skips migration", () => {
  const { result, calls, activeRollback, backupRollback, lockStillPresent } = exercise({ staged: true, fail: "signal-promotion" });
  assert.notEqual(result.status, 0);
  assert.equal(activeRollback, "# old rollback.sh\n");
  assert.equal(backupRollback, "# old rollback.sh\n");
  assert.equal(lockStillPresent, true);
  assert.match(result.stderr, /lock retained/);
  assert.doesNotMatch(calls, /stop --timeout|up -d api worker web/);
});

test("deploy refuses an incompatible API or worker even when it is stopped", () => {
  for (const containerState of ["running", "paused", "restarting", "exited", "created", "dead"]) {
    const { result, calls, lockStillPresent } = exercise({ fleet: "<no value>", containerState });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /incompatible API or worker/);
    assert.doesNotMatch(calls, /backup-postgres|up -d api worker web/);
    assert.equal(lockStillPresent, false);
  }
});

test("an explicitly selected idle legacy fleet can transition without backup once", () => {
  const { result, calls, lockStillPresent } = exercise({ fleet: "<no value>", cutoverId: legacyId, actualLegacyId: legacyId, skipBackup: "1", staged: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(lockStillPresent, false);
  assert.match(result.stdout, /backup explicitly skipped/);
  assert.doesNotMatch(calls, /backup-postgres\.sh/);
  assert.ok(calls.indexOf("stop --timeout 20 api") < calls.indexOf("stop --timeout -1 worker"));
  assert.ok(calls.indexOf("stop --timeout -1 worker") < calls.indexOf("up -d api worker web"));
});

test("legacy allowance refuses an unexpected fleet, schema or pending work before stopping services", () => {
  const legacy = { fleet: "<no value>", cutoverId: legacyId, actualLegacyId: legacyId, skipBackup: "1" };
  for (const change of [{ cutoverId: "sha256:bad" }, { actualLegacyId: `sha256:${"b".repeat(64)}` }, { fleetIds: "api-1 api-2 worker-1" }, { workerState: "exited" }, { runningApis: "" }, { fail: "legacy-env" }, { schemaState: "unsafe" }, { idleState: "busy" }, { queueState: "1" }, { queueState: "error" }]) {
    const { result, calls, lockStillPresent } = exercise({ ...legacy, ...change });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(calls, /stop --timeout|up -d api worker web/);
    assert.equal(lockStillPresent, false);
  }
});

test("new legacy work or an uncertain stop after maintenance retains the lock before migration", () => {
  const legacy = { fleet: "<no value>", cutoverId: legacyId, actualLegacyId: legacyId, skipBackup: "1" };
  for (const change of [{ idleAfter: "busy" }, { queueAfter: "1" }, { legacyExit: "exited 137 true" }, { legacyExit: "exited 1 false" }, { runningWorkers: "" }, { fail: "stop" }]) {
    const { result, calls, lockStillPresent } = exercise({ ...legacy, ...change });
    assert.notEqual(result.status, 0);
    assert.equal(lockStillPresent, true);
    assert.doesNotMatch(calls, /backup-postgres\.sh|up -d api worker web/);
  }
});

test("a bounded legacy API stop accepts forced termination without weakening NX drain", () => {
  const legacy = exercise({ fleet: "<no value>", cutoverId: legacyId, actualLegacyId: legacyId, skipBackup: "1", legacyExit: "exited 137 false" });
  assert.equal(legacy.result.status, 0, legacy.result.stderr);
  assert.match(legacy.calls, /stop --timeout 20 api/);
  const normal = exercise();
  assert.equal(normal.result.status, 0, normal.result.stderr);
  assert.match(normal.calls, /stop --timeout -1 api/);
  assert.doesNotMatch(normal.calls, /stop --timeout 20 api/);
});

test("backup remains required for normal NX upgrades and legacy upgrades without an explicit skip", () => {
  for (const options of [{ cutoverId: legacyId, skipBackup: "1" }, { fleet: "<no value>", cutoverId: legacyId, actualLegacyId: legacyId }]) {
    const { result, calls } = exercise(options);
    assert.equal(result.status, 0, result.stderr);
    assert.match(calls, /backup-postgres\.sh/);
  }
});

test("deploy requires explicit drain support and drains API before worker and migration", () => {
  for (const options of [{ targetDrain: "<no value>" }, { fleetDrain: "<no value>" }]) {
    const { result, calls } = exercise(options);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /drain/);
    assert.doesNotMatch(calls, /stop --timeout|up -d api worker web/);
  }
  const { result, calls } = exercise();
  assert.equal(result.status, 0, result.stderr);
  assert.ok(calls.indexOf("stop --timeout -1 api") < calls.indexOf("stop --timeout -1 worker"));
  assert.ok(calls.indexOf("stop --timeout -1 worker") < calls.indexOf("up -d api worker web"));
});

test("an uncertain API drain retains the lock without stopping the worker or migrating", () => {
  for (const fail of ["api-stop", "api-inspect", "api-error", "api-oom"]) {
    const { result, calls, lockStillPresent } = exercise({ fail });
    assert.notEqual(result.status, 0);
    assert.equal(lockStillPresent, true);
    assert.doesNotMatch(calls, /stop --timeout -1 worker|up -d api worker web|\nstart /);
  }
});

test("deployment checks the running image ID even when its former tag was repointed", () => {
  for (const options of [{ apiLabel: "<no value>", workerLabel: "nx-v1" }, { apiLabel: "nx-v1", workerLabel: "<no value>" }]) {
    const { result, calls } = exercise({ ...options, retagged: true });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /incompatible API or worker/);
    assert.match(calls, /inspect --format \{\{\.Image\}\}/);
    assert.doesNotMatch(calls, /up -d api worker web/);
  }
});

test("deploy accepts a compatible running or stopped fleet", () => {
  for (const options of [{}, { containerState: "exited", runningWorkers: "" }]) {
    const { result, calls } = exercise(options);
    assert.equal(result.status, 0, result.stderr);
    assert.match(calls, /backup-postgres/);
    assert.match(calls, /up -d api worker web/);
    assert.ok(calls.indexOf("stop --timeout -1 worker") < calls.indexOf("up -d api worker web"));
  }
});

test("deploy refuses an absent API or worker before migration", () => {
  for (const fleetIds of ["", "api-1", "worker-1"]) {
    const { result, calls, lockStillPresent } = exercise({ fleetIds, runningWorkers: "" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /fleet compatibility cannot be established/);
    assert.doesNotMatch(calls, /stop --timeout|backup-postgres|up -d api worker web/);
    assert.equal(lockStillPresent, false);
  }
});

test("deploy supplies the resolved default images to every compose invocation", () => {
  const { result, calls } = exercise({ useDefaultImages: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(calls, /up -d api worker web/);
});

test("uncertain worker stop, migration or replacement retains the release lock", () => {
  for (const fail of ["stop", "drain-inspect", "drain-error", "drain-oom", "migrate", "worker-missing", "worker-state", "worker-image-id", "api-missing", "api-state", "api-image-id", "target-image-id"]) {
    const { result, calls, lockStillPresent } = exercise({ fail });
    assert.notEqual(result.status, 0);
    assert.equal(lockStillPresent, true);
    if (["stop", "drain-inspect", "drain-error", "drain-oom"].includes(fail)) {
      assert.doesNotMatch(calls, /up -d api worker web|\nstart worker/);
    }
    if (fail === "migrate") {
      assert.match(calls, /up -d api worker web/);
      assert.doesNotMatch(calls, /\nstart worker/);
    }
  }
});

test("pre-migration dependency or backup failures restart existing workers and APIs", () => {
  for (const fail of ["dependencies", "backup-postgres.sh"]) {
    const { result, calls, lockStillPresent } = exercise({ fail });
    assert.notEqual(result.status, 0);
    assert.match(calls, /\nstart worker-1\n/);
    assert.match(calls, /\nstart api-1\n/);
    assert.ok(calls.indexOf("start worker-1") < calls.indexOf("start api-1"));
    assert.doesNotMatch(calls, /up -d api worker web/);
    assert.equal(lockStillPresent, false);
  }
});

test("ambiguous legacy continuations stop preflight before any worker is touched", () => {
  for (const options of [{ legacyPending: "ambiguous" }, { legacyPending: "unexpected" }, { fail: "legacy-query" }]) {
    const { result, calls, lockStillPresent } = exercise(options);
    assert.notEqual(result.status, 0);
    assert.equal(lockStillPresent, false);
    assert.doesNotMatch(calls, /stop --timeout|backup-postgres|up -d api worker web|\nstart /);
  }
});

test("continuations appearing during drain retain the lock before migration", () => {
  for (const options of [{ afterDrain: "ambiguous" }, { afterDrain: "unexpected" }, { dbRunning: false, fail: "legacy-query" }]) {
    const { result, calls, lockStillPresent } = exercise(options);
    assert.notEqual(result.status, 0);
    assert.equal(lockStillPresent, true);
    assert.match(calls, /stop --timeout -1 worker/);
    assert.doesNotMatch(calls, /backup-postgres|up -d api worker web|\nstart /);
  }
});

test("running or uninspectable executions after drain retain the lock before migration", () => {
  for (const options of [{ runningState: "running" }, { runningState: "unexpected" }, { fail: "running-query" }]) {
    const { result, calls, lockStillPresent } = exercise(options);
    assert.notEqual(result.status, 0);
    assert.equal(lockStillPresent, true);
    assert.match(calls, /stop --timeout -1 worker/);
    assert.doesNotMatch(calls, /backup-postgres|up -d api worker web|\nstart /);
  }
});

test("legacy continuation query handles schemas before and after the NX migration", { skip: process.env.FLUXORA_ROLLBACK_INTEGRATION !== "1" }, async () => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^\/fluxora_[a-z0-9_]*test[a-z0-9_]*$/.test(url.pathname)) throw new Error("Deployment test requires a disposable local fluxora_*test* database.");
  const source = readFileSync(join(root, "infra/scripts/release-lock.sh"), "utf8");
  const expression = source.match(/^\s*legacy_pending_sql="(.*)"$/m)?.[1];
  const runningExpression = source.match(/^\s*running_execution_sql="(.*)"$/m)?.[1];
  const idleExpression = source.match(/^\s*legacy_idle_sql="(.*)"$/m)?.[1];
  const schemaExpression = source.match(/^\s*legacy_schema_sql="(.*)"$/m)?.[1];
  assert.ok(expression);
  assert.ok(runningExpression);
  assert.ok(idleExpression);
  assert.ok(schemaExpression);
  const sql = expression.replaceAll('\\"', '"');
  const runningSql = runningExpression.replaceAll('\\"', '"');
  const idleSql = idleExpression.replaceAll('\\"', '"');
  const schemaSql = schemaExpression.replaceAll('\\"', '"');
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query('CREATE TEMP TABLE "Execution" (status text, "startedAt" timestamptz) ON COMMIT DROP');
    assert.equal((await client.query(sql)).rows[0].case, "clear");
    assert.equal((await client.query(runningSql)).rows[0].case, "clear");
    await client.query('INSERT INTO "Execution" VALUES ($1, now())', ["RUNNING"]);
    assert.equal((await client.query(runningSql)).rows[0].case, "running");
    await client.query('DELETE FROM "Execution" WHERE status = $1', ["RUNNING"]);
    await client.query('INSERT INTO "Execution" VALUES ($1, now())', ["QUEUED"]);
    assert.equal((await client.query(sql)).rows[0].case, "ambiguous");
    await client.query('ALTER TABLE "Execution" ADD COLUMN "resumeToken" text');
    await client.query('UPDATE "Execution" SET "resumeToken" = $1', ["a".repeat(48)]);
    assert.equal((await client.query(sql)).rows[0].case, "clear");
    await client.query('UPDATE "Execution" SET "resumeToken" = $1', ["invalid-token"]);
    assert.equal((await client.query(sql)).rows[0].case, "ambiguous");
    await client.query('UPDATE "Execution" SET "resumeToken" = NULL');
    assert.equal((await client.query(sql)).rows[0].case, "ambiguous");
    await client.query('CREATE TEMP TABLE "ApprovalRequest" (status text) ON COMMIT DROP');
    assert.equal((await client.query(idleSql)).rows[0].case, "busy");
    await client.query('DELETE FROM "Execution"');
    assert.equal((await client.query(idleSql)).rows[0].case, "clear");
    await client.query('INSERT INTO "ApprovalRequest" VALUES ($1)', ["PENDING"]);
    assert.equal((await client.query(idleSql)).rows[0].case, "busy");
    await client.query('CREATE TEMP TABLE "_prisma_migrations" (migration_name text, finished_at timestamptz, rolled_back_at timestamptz) ON COMMIT DROP');
    assert.equal((await client.query(schemaSql)).rows[0].case, "legacy");
    await client.query('INSERT INTO "_prisma_migrations" VALUES ($1, now(), NULL)', ["20261103150000_execution_run_token"]);
    assert.equal((await client.query(schemaSql)).rows[0].case, "unsafe");
    await client.query('DELETE FROM "_prisma_migrations"');
    await client.query('INSERT INTO "_prisma_migrations" VALUES ($1, NULL, NULL)', ["unrelated_failed_migration"]);
    assert.equal((await client.query(schemaSql)).rows[0].case, "unsafe");
  } finally { await client.query("ROLLBACK"); await client.end(); }
});

test("failed preparation restores only the API and workers that were running before deployment", () => {
  const none = exercise({ fail: "dependencies", runningApis: "", runningWorkers: "" });
  assert.notEqual(none.result.status, 0);
  assert.doesNotMatch(none.calls, /\nstart /);
  assert.equal(none.lockStillPresent, false);
  const apiOnly = exercise({ fail: "dependencies", runningWorkers: "" });
  assert.match(apiOnly.calls, /\nstart api-1\n/);
  assert.doesNotMatch(apiOnly.calls, /\nstart worker/);
  const multiple = exercise({ fail: "dependencies", runningWorkers: "worker-1 worker-2" });
  assert.match(multiple.calls, /\nstart worker-1\n/);
  assert.match(multiple.calls, /\nstart worker-2\n/);
  assert.equal(multiple.lockStillPresent, false);
  for (const restartFailure of ["start", "state"]) {
    const uncertain = exercise({ fail: "dependencies", restartFailure });
    assert.notEqual(uncertain.result.status, 0);
    assert.equal(uncertain.lockStillPresent, true);
    assert.doesNotMatch(uncertain.calls, /up -d api worker web/);
  }
});

test("deploy checks both services even when only one is incompatible", () => {
  for (const options of [{ apiLabel: "nx-v1", workerLabel: "<no value>" }, { apiLabel: "<no value>", workerLabel: "nx-v1" }, { apiState: "exited", workerLabel: "<no value>" }]) {
    const { result, calls } = exercise(options);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(calls, /backup-postgres|up -d api worker web/);
  }
});

test("deploy fails closed on an uncertified target or uncertain fleet state", () => {
  for (const options of [{ target: "<no value>" }, { fail: "target-label" }, { fail: "fleet" }, { fail: "state" }, { fail: "image" }, { fail: "old-label" }, { containerState: "unknown" }]) {
    const { result, calls } = exercise(options);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(calls, /backup-postgres|up -d api worker web/);
  }
});
