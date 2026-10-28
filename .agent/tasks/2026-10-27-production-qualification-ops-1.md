# Task contract

## Identity

- Task ID: `2026-10-27-production-qualification-ops-1`
- Base commit: `41764e550a8530ff0381f2897a4b586e810a3f66`
- Working branch: `main` (merged production candidate)
- Implementer/reviewer: `Codex and human owner`

## Outcome

Collect redacted operator evidence for the merged production release candidate
without provider calls, OAuth account interaction, live workflow activation, or
restoring over the production database.

## Target slice IDs

- `OPS-1`

## In scope

- Read-only VPS, DNS, TLS, Nginx, container, disk, health, readiness, image,
  and backup-format checks.
- Isolated restore into a disposable database container with no production
  volume or published port.
- Record factual evidence without secret values or provider payloads.
- Identify the remaining human/operator gates.

## Explicitly out of scope

- Full deployment, migration, production rollback, or production restore. The
  post-merge deployment is automated and is recorded as external evidence, not
  as an OPS-1 action.
- Stopping staging or production containers.
- Copying backups off-host without an approved encrypted destination.
- Real provider calls, OAuth account interaction, or live workflow activation.
- Reading or printing `.env.production` values.

## Acceptance criteria

- [x] Production domains, TLS, Nginx configuration, runtime images, service
  health, and API readiness are checked.
- [x] Existing PostgreSQL backup format is checked and restored into an
  isolated disposable database without touching production.
- [x] Evidence report separates pass, unverified, and blocked items.
- [x] No secret value, provider payload, or production database mutation is
  included in the report.
- [ ] A qualification-only API/Worker recreate without migrations was not
  performed; the automatic post-merge deployment ran the normal
  migration-aware release path before this qualification.

## Required evidence

- Tests: `npm run agent:task:check`, `npm run harness:report`.
- Commands: fixed-domain health/readiness, Nginx syntax check, Docker
  status/image inspection, backup-format listing, and isolated restore.
- UI/manual proof, if relevant: none.

## Safety boundaries

- Read `AGENTS.md`, `docs/06-loop-engineering.md`, `docs/10-agent-harness.md`,
  `docs/11-code-graph.md`, and `docs/19-agent-state.md` before editing.
- Do not use, print, commit, or request real provider credentials.
- Do not deploy, publish, merge, or enable live workflow execution as part of
  this qualification.
- Do not restore a backup into the production database.
