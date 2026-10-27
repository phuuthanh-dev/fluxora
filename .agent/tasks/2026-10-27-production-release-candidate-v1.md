# Task contract

## Identity

- Task ID: `2026-10-27-production-release-candidate-v1`
- Base commit: `8bfacaf`
- Working branch: `codex/production-release-candidate-v1`
- Implementer/reviewer: `Codex and human owner`

## Outcome

Prepare a production release candidate that can be independently reviewed and
operator-qualified without deploying to the VPS, reading real secret values, or
calling providers.

## Exactly three vertical slices

1. CI/security release contracts, dependency audit, and production environment
   name/shape validation.
2. Operator qualification runbook and evidence model for DNS/TLS,
   backup/restore, rollback, health smoke, and migration compatibility.
3. Release-candidate documentation, focused evidence, full verification, and a
   review-ready handoff.

## Explicitly out of scope

- VPS, DNS, Nginx, Docker, GitHub secret, or GitHub Environment mutation.
- Reading, printing, or storing any real secret or production `.env` value.
- OAuth account interaction, provider calls, or enabling a live workflow.
- New runtime connectors, RBAC, mobile UI, or arbitrary code execution.

## Acceptance criteria

### Slice 1 — CI/security release contracts

- [x] Tracked-file secret scanning fails on high-confidence credential patterns
  and ignores only documented safe placeholders/fixtures.
- [x] Production env validation checks names, required values, URL shapes,
  provider all-or-nothing groups, and immutable image SHA without printing
  values.
- [x] `npm audit --omit=dev --audit-level=high` is part of the CI contract and
  currently passes.
- [x] Migration/schema/client compatibility checks remain in the quality gate.

### Slice 2 — operator qualification

- [x] Runbook explicitly sequences backup before migration, isolated restore,
  migration compatibility, immutable rollback, health smoke, and approval.
- [x] Evidence fields distinguish automated output from operator/owner input and
  never request secret values in reports.
- [x] Deployment protection requires a protected `production` environment with
  human approval before deploy job execution.

### Slice 3 — release candidate handoff

- [x] Documentation and task/report artifacts reflect the current release
  candidate status and remaining NO-GO conditions.
- [x] Focused tests, report validation, code graph check, and `npm run verify`
  pass with no Redis integration test skipped.
- [x] One focused commit per slice; no deployment or provider side effect.
