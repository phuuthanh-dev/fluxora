# ACCOUNT-1 / L14.1 delivery

## Outcome

Status: complete (local implementation). Account settings and password recovery
now have API, durable email, UI and synthetic proof. Real system SMTP activation
and release are separate operator steps, not claimed as completed.

## Commit and scope

- Base: `3ee77fc4d1b8976282b8ec72ad2044d09c798ea8` (merged/deployed PR #46).
- Implementation: commit containing this report, local `codex/account-recovery`
  integrated into local `develop`; no remote feature branch/push/deploy.
- Scope respected: yes. No real provider email, secrets, workflow execution,
  email-address change, MFA, deletion, avatar upload or OAuth-scope changes.
- Corrected stale documentation that still called SMTP Email UI-only and the
  previous auth-header release pending; no repeated implementation of either.

## Acceptance criteria

| Criterion | Evidence | Status |
|---|---|---|
| Own profile/password/sessions | AccountService + guarded controller; real-browser profile/password/session scenario | pass |
| Single-use reset/revocation | Dedicated PostgreSQL schema; simultaneous reset, replay, expiry, old-password login race, audit rollback | pass |
| Private token/mail handling | Hash-only lookup, encrypted outbox, no raw-token API, fragment removal, no browser persistence | pass |
| Bounded durable sending | Exclusive claim, scrub after attempt, failed/uncertain not retried, stale claim cleanup; synthetic transport only | pass |
| Shared UX | Account, forgot/reset routes; auth header/control reuse; light/dark 1440/390 screenshots, focus and overflow checks | pass |
| Existing application regression | Default full verify including 86 E2E | pass |

## Validation receipts

| Command/check | Result | Evidence |
|---|---|---|
| `npm run agent:task:check -- .agent/tasks/2026-10-30-account-recovery.md` | pass before implementation and final gate | ACCOUNT-1 was approved; it is now moved to closed ledger |
| `npm run db:deploy` | pass, local additive migration | Account tables added; previously pending SMTP enum migration also applied; no reset/seed/data deletion |
| `npx tsx --test src/auth/account-security.test.ts src/auth/account.integration.test.ts` from apps/api | pass, 13 tests | `/tmp/fluxora-account-tests.log`; integration creates/drops its own random schema |
| `npx playwright test e2e/account-recovery.spec.ts` | pass, 4 tests | `/tmp/fluxora-account-e2e.log` |
| `npm run verify` | pass, exit 0 | `/tmp/fluxora-account-verify.log`: 226 API, 23 web, 86 E2E; production builds/typechecks/harness |
| `npm run harness:check` after staging new files and closing the ledger | pass, exit 0 | `/tmp/fluxora-account-final-harness.log`; tracked-secret scan includes all new files |
| Visual inspection | pass with stated limits | `../previews/account-recovery-2026-10-30/` has all 12 route/theme/viewport captures plus settled dark reset screenshot |

An initial root-directory tsx invocation missed the API decorator config; it was
rerun from apps/api. Initial browser assertions also matched Next's live-region
announcer and were correctly scoped. The browser suite exposed a real same-route
hash-navigation bug; reset now handles a new fragment and removes it. A captured
dark icon frame was checked again after compositor settling: actual inherited
stroke is the dark-theme accent, not the old light-theme shade.

## Files changed

- AuthModule: account controller/service/guard/filter, system mail and auth login
  transaction; additive Prisma schema/migration; API security/integration tests.
- Web: account settings, forgot/reset pages, shared auth navigation/password field,
  login recovery link, avatar settings entry and safe unlink error feedback.
- Product composition CSS, robots/private metadata, privacy disclosure.
- Task/loop/state ledger, product spec, architecture, implementation plan, code
  graph, public-route/account docs, README and environment examples.

## Risks and follow-up

System mail is disabled by default. Before enabling, configure a verified sender
and qualify real inbox delivery to an explicitly authorized recipient. SMTP
acceptance alone does not prove delivery. No real credentials were used here.
IP throttling is bounded per API process, not distributed; account cooldown is
database-backed. Disabled mail stops cleanup as documented. No hard claim of
production-wide readiness, email verification, backup/restore or provider smoke.

Retain the existing encryption key. Migration adds tables only; older application
images can ignore them, so rollback should leave schema/data in place. Follow
docs/29 and the develop → main release process; do not recreate this slice.
