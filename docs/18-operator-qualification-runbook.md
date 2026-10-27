# Production operator qualification runbook

This runbook is the human-operated part of the release gate. It is intentionally
separate from `npm run release:preflight`: repository automation cannot prove
DNS, TLS, recoverability, VPS state, or external side effects.

Never paste secret values, private keys, `.env.production`, database dumps, or
provider payloads into the evidence record. Record only command status, a
timestamp, the tested commit SHA, and redacted host/service names.

## 0. Release identity and approval

Record:

| Field | Value |
|---|---|
| Candidate commit SHA | `<40-character lowercase SHA>` |
| Operator | `<name>` |
| Start/end UTC | `<timestamps>` |
| Production Environment approval | `approved / not approved` |
| Rollback SHA | `<known-good 40-character lowercase SHA>` |

Before any deploy job can run, configure the GitHub `production` Environment with
required reviewers and verify that the deploy job references that environment.
The build job may build images, but the deploy job must remain approval-gated.

## 1. Repository qualification

Run from the exact candidate checkout:

```bash
npm ci
npm run security:check
npm run release:preflight
npm run verify
```

Expected evidence:

- high-confidence tracked-secret scan passes;
- `npm audit --omit=dev --audit-level=high` passes;
- release preflight has no `BLOCKED` repository contract;
- all tests pass with no Redis integration skip;
- the report names the exact candidate SHA.

## 2. DNS, TLS, and production configuration

From an operator-controlled machine, verify both domains resolve to the intended
VPS and that the certificate covers both hostnames. On the VPS, render the
Nginx template, run `nginx -t`, and reload only after the test passes.

Run the non-printing environment validator against the real file on the VPS:

```bash
node scripts/validate-production-env.mjs \
  --env-file /opt/workflow-automation/.env.production
```

The command validates names and shapes only. It must not be changed to print
values for troubleshooting. Fix placeholders, callback mismatches, or an
invalid immutable image SHA before approval.

## 3. Backup before migration

The release script starts only the database and Redis, waits for the database
health condition, creates a permission-restricted custom-format PostgreSQL
backup, and only then starts the migration service. A failed backup stops the
release before migration.

The operator must copy the backup off-host using an approved encrypted channel
and record only its redacted filename, timestamp, and checksum location. Do not
commit or attach the dump to the repository.

## 4. Isolated restore drill

Restore the backup into an isolated database or disposable Compose project. Do
not restore over the production volume as a test. The provided restore command
requires an explicit destructive-operation guard:

```bash
CONFIRM_RESTORE=RESTORE \
  APP_DIR=/opt/workflow-automation \
  infra/scripts/restore-postgres.sh /secure/path/postgres-<timestamp>.dump
```

Record whether the isolated database starts, migrations are compatible, and a
representative owner-scoped read succeeds. Record no row values or credentials.

## 5. Migration and runtime health

The candidate migration service must complete successfully before API/worker/web
start. Then run the fixed-target smoke check from a trusted host:

```bash
npm run release:smoke -- \
  --api-origin https://api.fluxora.io.vn \
  --web-origin https://fluxora.io.vn
```

Expected results are HTTP 200 for API liveness, API readiness, and the web root.
Also record `docker compose ps` status for `db`, `redis`, `api`, `worker`, and
`web`; do not paste logs containing environment values.

## 6. Rollback qualification

Keep the current candidate and known-good image SHA. If rollback is needed, run
the guarded immutable rollback script with the known-good SHA, then repeat the
health smoke and readiness checks. Confirm that PostgreSQL and Redis volumes are
preserved and that no mutable image tag was used.

## 7. Go/No-Go decision

Go requires all automated checks, operator evidence, and owner inputs in
[`17-release-go-no-go.md`](./17-release-go-no-go.md). It remains No-Go when DNS,
TLS, recovery, environment protection, callback configuration, or explicit
live-provider approval is missing. A successful mock execution is not evidence
of a real external side effect.
