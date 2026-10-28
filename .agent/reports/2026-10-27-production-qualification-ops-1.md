# OPS-1 production qualification report

## Outcome

- Status: `conditional`
- One-sentence result: The merged candidate is running on the VPS with healthy
  application dependencies, valid DNS/TLS/Nginx routing, a fresh readable
  PostgreSQL backup, and a successful isolated restore; production remains
  conditional because no approved off-host backup destination was supplied,
  rollback was not executed, and live-provider validation is a separate owner
  gate.

## Commit and scope

- Candidate commit: `41764e550a8530ff0381f2897a4b586e810a3f66`
- GitHub deployment run: `https://github.com/phuuthanh-dev/workflow-automation/actions/runs/40620132077`
- Scope: operator qualification only; no provider calls, OAuth interaction, live
  workflow activation, production restore, or production rollback was performed
  by this qualification.
- The post-merge deployment was automatic and completed successfully before the
  final checks. It used the normal migration-aware release script; this report
  does not claim that migrations were skipped.

## Acceptance criteria

| Criterion | Status |
|---|---|
| Production routing, runtime health, readiness, and fixed-target smoke are verified | pass |
| PostgreSQL backup format is verified and restored in an isolated disposable database | pass |
| Evidence is redacted and separates pass, pending, and not-verified items | pass |
| No production database mutation or provider call was performed by OPS-1 | pass |
| Qualification-only API/Worker recreate without migrations | not verified; automatic deployment already used the migration-aware path |

## Evidence

| Check | Evidence | Status |
|---|---|---|
| Repository candidate | `main` and `origin/main` point to `41764e550a8530ff0381f2897a4b586e810a3f66`; working tree clean | pass |
| GitHub deployment | Build/push and deploy jobs completed successfully for the candidate SHA | pass |
| DNS | `fluxora.io.vn` and `api.fluxora.io.vn` resolve to `103.140.249.73` | pass |
| TLS and HTTPS | Both origins returned HTTP 200 with curl TLS verification result `0`; API health/readiness and web root passed | pass |
| Nginx | `sudo nginx -t` returned syntax valid and test successful | pass |
| Runtime images | API, worker, and web run image tag `41764e550a8530ff0381f2897a4b586e810a3f66` | pass |
| Runtime health | Production `db`, `redis`, `api`, and `web` are healthy; worker is running | pass |
| Production env shape | Runtime-only non-printing check: zero required fields missing, `NODE_ENV=production`, Redis queue mode, immutable tag, canonical encryption-key shape, HTTPS origins | pass |
| Fixed-target smoke | `npm run release:smoke -- --api-origin https://api.fluxora.io.vn --web-origin https://fluxora.io.vn`: 3/3 HTTP 200 | pass |
| Backup format | Fresh `postgres-20261028T022402Z.dump`, mode `600`, `pg_restore --list` exited 0 | pass |
| Isolated restore | Dump restored into a disposable `postgres:16-alpine` container with no published port or production volume; 83 tables observed; container removed | pass |
| Off-host backup | No approved encrypted destination was supplied; backup stayed on VPS | pending operator action |
| Rollback readiness | Previous immutable application tags remain on the VPS and rollback script is present; no rollback executed | pass (readiness only) |
| Qualification-only recreate | Not performed because the automatic deployment already ran the migration-aware release path | not verified |
| Live provider smoke | Not run; requires explicit owner approval and real provider side effect | pending owner input |

## Validation receipts

| Command/check | Result |
|---|---|
| `npm run security:check` | pass; no high-confidence tracked secret pattern |
| `npm run release:preflight` | pass for repository contracts; remains `CONDITIONAL_GO` pending operator/owner gates |
| `npm run release:smoke -- --api-origin https://api.fluxora.io.vn --web-origin https://fluxora.io.vn` | pass; 3/3 HTTP 200 |
| `npm run agent:task:check -- .agent/tasks/2026-10-27-production-qualification-ops-1.md` | pass |
| `npm run harness:report -- .agent/reports/2026-10-27-production-qualification-ops-1.md` | pass; report format valid |
| GitHub Quality Gate for candidate | pass; deployment run was allowed to complete |
| Local `npm run verify` | 26/29 E2E passed; 3 failures were Playwright trace-artifact `ENOENT` cleanup errors, not assertion failures |
| Targeted rerun with `--trace=off` | pass; the 3 affected tests passed |

## Files changed

- `.agent/tasks/2026-10-27-production-qualification-ops-1.md`
- `.agent/reports/2026-10-27-production-qualification-ops-1.md`

## Risks and follow-up

- Runtime is aligned to the candidate, but `/opt/workflow-automation` itself is
  not a clean checkout: it remains on `codex/production-deployment` at
  `93a36560ba298c78056d50a2e9094e21fcdf073a` with 14 modified/untracked
  deployment and backup paths. Compose uses immutable images and copied release
  files, so runtime qualification passed; the checkout drift should be cleaned
  in a separate operator-maintenance slice.
- Disk usage is approximately 84% (about 2.3 GB available on a 14 GB
  filesystem). Staging containers remain running; no cache/image cleanup was
  performed in OPS-1.
- The production verdict remains conditional until an approved off-host backup
  copy is recorded and the owner supplies explicit live-provider approval.

## Follow-up gates

1. Operator supplies an approved encrypted off-host backup destination and records
   only redacted filename/timestamp/checksum metadata.
2. Operator cleans the VPS checkout/staging drift without touching production
   volumes, then re-runs the fixed-target smoke.
3. Owner explicitly approves one controlled real provider run and separately
   confirms OAuth callback configuration; this is tracked as `LIVE-1`.
