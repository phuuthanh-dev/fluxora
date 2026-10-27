# Task contract

## Identity

- Task ID: `2026-10-27-production-qualification-ops-1`
- Base commit: `086fc7356ca45c098874deecd587fe3f207d8130`
- Working branch: `codex/production-release-candidate-v1`
- Implementer/reviewer: `Codex and human owner`

## Outcome

Collect redacted operator evidence for the already-deployed production release
candidate without deploying, enabling workflows, calling providers, or
restoring over the production database.

## Target slice IDs

- `OPS-1`

## In scope

- Read-only VPS, DNS, TLS, Nginx, container, disk, health, readiness, image,
  and backup-format checks.
- Apply only the two non-secret queue/event variables required by the release
  contract and recreate API/Worker without migration.
- Record factual evidence without secret values or provider payloads.
- Identify the remaining human/operator gates.

## Explicitly out of scope

- Full deployment or migration. A controlled API/Worker recreate for the two
  required non-secret queue variables is explicitly allowed above.
- Stopping staging or production containers.
- Copying backups off-host.
- Restoring into any production database.
- Real provider calls, OAuth account interaction, or live workflow activation.
- Reading or printing `.env.production` values.

## Acceptance criteria

- [x] Production domains, TLS, Nginx configuration, runtime images, service
  health, and API readiness are checked.
- [x] Existing PostgreSQL backup format is checked without restoring it.
- [x] Evidence report separates pass, unverified, and blocked items.
- [x] No secret value, provider payload, or production database mutation is
  included in the report.
- [x] The API/Worker recreate did not run migrations and was followed by
  readiness and fixed-target smoke checks.

## Required evidence

- Tests to add or update: `npm run agent:task:check`, `npm run harness:report`.
- Commands to run: fixed-domain health/readiness, Nginx syntax check, Docker
  status/image inspection, backup-format listing.
- UI/manual proof, if relevant: none.

## Safety boundaries

- Read `AGENTS.md`, `docs/06-loop-engineering.md`, `docs/10-agent-harness.md`,
  `docs/11-code-graph.md`, and `docs/19-agent-state.md` before editing.
- Do not use, print, commit, or request real provider credentials.
- Do not deploy, publish, merge, or enable live workflow execution.
- Do not restore a backup into the production database.
