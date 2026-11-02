# NX-01 delivery safety handoff

## Outcome

Implementation integrated and final local quality gate passed. Release is tracked
by the resulting develop-to-main PR and its exact-commit Actions runs.
Base `6010e4e` (audit), runtime base `04d67b6`. Target `APP-EXPANSION-1`,
NX-01 only. This is a runtime safety correction with no schema migration,
dependency, new app, OAuth scope or credential change.

## Changes

- Runner preserves explicit adapter retry decisions, including false for 5xx,
  network and timeout codes. Stored errors agree with execution behavior.
- HTTP, Drive/Sheets and GitHub writes stop on ambiguous results. Known 429
  rejections and transient reads may retry. GitHub marker lookup remains a
  best-effort read, not provider-enforced idempotency.
- SMTP requires consistent acceptance of all intended recipients. Existing
  success keys remain; submission status/count and `deliveryConfirmed:false`
  clarify semantics. Partial and uncertain outcomes never automatically replay.
- Notification sends conservatively reject retries after ambiguous transport,
  5xx or unreadable receipts; successful receipts are bounded and validated.
- Shared text/JSON reader enforces a streaming 1,000,000-byte cap with UTF-8
  correctness, cancellation, lock release and content-free parse failures.

## Parallel ownership and review

Three agents used separate local worktrees for SMTP, bounded response and
notifications. They wrote tests without running them. The coordinator integrated
only assigned files, implemented runner/HTTP/Google/GitHub and regression tests,
and retained the preexisting generated `apps/web/next-env.d.ts` change outside
the release. Independent review caught redirect retry provenance, a bodyless HEAD
edge case, two wrong test node IDs and missing receipt regressions. All four
were corrected before validation.

## Validation

Final isolated `npm run verify`: PASS (521 API tests/subtests, 32 web, 147 E2E;
typecheck, build, state/codegraph/deployment/security gates). Log:
`/private/tmp/fluxora-nx01-verify-final.log`, exit 0. API tests took about 7.1s;
the 147 existing E2E took 5.1m. No new E2E matrix was added.

The first environment setup lacked workspace-local Prisma dependencies, before
verification could start. The first actual gate then exposed test assertions
that conflicted with explicit body cancellation, an invalid HTTP credential
fixture and a test-origin override. Those were corrected; the full final gate
passed. Log of the failed gate: `/private/tmp/fluxora-nx01-verify.log`.

Verification used `/private/tmp/fluxora-nx01-verify-20261102`, dedicated
`fluxora_nx01_test_20261102` PostgreSQL, ephemeral Redis, a random test-only
encryption key, ports 3320/3321, synthetic credentials and transport responses.
No live provider qualification claimed. Existing marketing GSAP/WebGL warnings
did not fail the suite. Local web and API readiness returned HTTP 200 on
3000/3001; scheduling remains disabled only in the local process.

## Limits and next work

Manual retries can duplicate provider effects; users must inspect the destination.
SMTP acceptance cannot prove inbox delivery. Discord's existing bodyless 204
acknowledgement is preserved and does not prove message persistence. AI duplicate
usage/cost, Retry-After, pagination and typed node registry/versioning are NX-02+
follow-ups. Existing Calendar/MongoDB/Trello reconciliation/guards are preserved.
