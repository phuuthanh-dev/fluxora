# Task contract

## Identity

- Task ID: `2026-10-27-runtime-qualification-v1`
- Base commit: `b8dbba12072762b7ff77719f48dd2694bb4c7cb0`
- Working branch: `codex/runtime-qualification-v1`
- Implementer: `Codex`
- Reviewer: `Codex and human owner`

## Outcome

Fluxora has reproducible production-like queue evidence, enough redacted
execution detail to diagnose failures from the UI, and a factual Go/No-Go
release-preflight contract without deploying or calling a real provider.

## Exactly three vertical slices

1. Redis/BullMQ worker qualification in local/CI infrastructure.
2. Execution timeline, failure explanation, and redacted diagnostics.
3. Release-preflight audit, checklist, and smoke-test automation.

## In scope

- Redis-backed API/worker process separation, queue semantics, and CI services.
- Integration coverage for handoff, bounded concurrency, delayed/retry jobs,
  cron deduplication, SSE delivery, worker shutdown/restart, and persisted runs.
- Owner-authorized execution event data derived from already-redacted execution
  and node-execution records.
- Execution timeline and diagnostic export UI with loading, empty, and error
  states plus light/dark, keyboard, reduced-motion, and zoom regression.
- Read-only preflight checks for environment key presence/shape, migration,
  readiness, backup/rollback scripts, domain/TLS/OAuth contracts, log redaction,
  and GitHub secret/variable names.
- Task/report contracts, loop and implementation documentation, code graph, and
  repeatable verification commands.

## Explicitly out of scope

- Reading or printing secret values, provider tokens, or production `.env`
  contents.
- Real provider calls, OAuth account interaction, VPS changes, deployment,
  DNS/TLS changes, GitHub secret mutation, or production database mutation.
- Automatic replay of an interrupted live execution; unknown external side
  effects remain terminal and require an explicit human retry.
- New connectors, mobile editor redesign, RBAC, or arbitrary code execution.

## Acceptance criteria

### Slice 1 — Redis/BullMQ qualification

- [x] The standard CI quality gate provisions Redis and runs every Redis
  integration test without test-level skip declarations.
- [x] API enqueue and isolated worker execution use a unique test queue and
  leave no Redis jobs/connections behind.
- [x] Tests prove bounded concurrency, delayed retry behavior, cron occurrence
  deduplication, owner-scoped SSE notification, and safe worker shutdown/restart.
- [x] A worker interruption does not silently replay unknown live side effects;
  lease maintenance produces a terminal redacted failure.

### Slice 2 — execution observability

- [ ] An owner can inspect a chronological execution timeline with execution and
  node state, attempts, duration, and normalized redacted errors.
- [ ] Failure UI explains retryability, error-branch routing, and why downstream
  nodes were skipped without guessing from color alone.
- [ ] A downloadable diagnostic snapshot is schema-versioned, deterministic,
  redacted, and excludes credentials, secrets, raw headers, and webhook URLs.
- [ ] Loading, empty, API-error/retry, light/dark, keyboard, reduced-motion, and
  125%/150% zoom-equivalent behavior have focused browser coverage.

### Slice 3 — release preflight

- [ ] Documentation no longer contradicts current accessibility, Redis, or
  deployment status.
- [ ] A read-only preflight command checks required names/contracts for runtime
  environment, migrations, readiness, backup/restore, rollback, domains/TLS,
  OAuth callbacks, logging/redaction, and GitHub Actions configuration.
- [ ] A safe smoke-test script checks only local/configured health endpoints by
  default and cannot deploy or invoke providers.
- [ ] A Go/No-Go checklist distinguishes automated pass, operator evidence,
  user credential input, and explicitly blocked release conditions.
- [ ] Focused tests, report validation, code-graph check, and `npm run verify`
  pass with no Redis integration test skipped.

## Required evidence

- Focused API integration tests against ephemeral/CI Redis and PostgreSQL.
- Focused web unit/Playwright tests for timeline and diagnostic export.
- Contract tests for all release-preflight scripts and read-only behavior.
- `npm run codegraph:generate` after source-import changes.
- `npm run verify` and a validated report based on
  `.agent/report-template.md`.

## Safety boundaries

- Use deterministic local records and mocked providers only.
- Never read, print, modify, or commit `.env` values or provider secrets.
- Do not deploy, publish, mutate GitHub secrets, or call external providers.
- Keep each slice independently reviewable and commit only after its focused
  quality checks pass.
