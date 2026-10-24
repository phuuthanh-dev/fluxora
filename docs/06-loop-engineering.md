# Loop Engineering Protocol

This repository is developed through small, verified delivery loops. A loop is complete only when its acceptance criteria, automated checks, and documentation status agree.

## Loop sequence

1. **Select one vertical slice.** It must have a user-visible outcome and no hidden dependency on an unfinished later slice.
2. **Define proof before implementation.** Add or update the narrowest relevant test first where practical.
3. **Implement only the selected slice.** Keep the browser free of provider secrets and provider calls.
4. **Run the quality gate.** The required command is `npm run verify`; targeted tests and a local manual check supplement it.
5. **Review against the product acceptance criteria.** Mark the loop as done only with reproducible evidence.
6. **Commit a focused change.** Update this file and the implementation plan when the delivered behavior changes.

## Automated quality gate

`npm run verify` runs, in order:

1. Prisma schema validation
2. Prisma Client generation from that schema
3. Unit and integration tests
4. TypeScript checks
5. Production build
6. Playwright browser E2E

CI runs the same gate for every pull request and push to `main`.

## Active delivery loops

| Loop | Outcome | Status | Proof required |
|---|---|---:|---|
| L0 | Repeatable repository quality gate and CI | Complete | `npm run verify` passed locally; GitHub Actions checks the same gate |
| L1 | Authenticated owner can create, save, reload, and publish a workflow | Complete | HTTP and browser checks passed locally |
| L2 | Pinned version can run with persisted node I/O | Complete locally | Inline mock, authenticated SSE, retry/error-edge HTTP E2E, and browser save/publish/history coverage passed locally; Redis worker qualification is deferred until a Redis runtime is available |
| L3 | Credential vault plus Steam → Google Chat mock and live-capable adapters | Complete locally | Mock flow, provider-aware credential creation/selection, and live-capable backend adapters are verified; live activation needs user-provided credentials |
| L4 | Cron, webhook, approval, Google Drive/Sheets, execution UI and polish | Complete locally | Cron dispatch test, editor webhook endpoints, approval pause/resume plus app-link notification, Drive → Sheets mock E2E, grouped editor actions, provider-aware credentials, and Playwright browser-onboarding checks exist; live Google OAuth/Chat validation remains |
| L5.1 | Block unsafe workflow-configured outbound requests | Complete locally | Unit tests cover loopback/private/link-local targets, hostnames resolving to blocked ranges, and redirect revalidation. The policy is used by generic HTTP, Google Chat, and approval webhook deliveries. |
| L5.2 | Make production queue configuration and readiness explicit | Complete | Production environment validation requires Redis queue configuration; readiness checks PostgreSQL plus queue availability and depth. Dedicated workers cannot start cron ingress; the Redis worker integration passed in GitHub Actions run 40115210885. |
| L5.3 | Prevent abandoned execution state and unbounded history | Complete locally | Schema migration, lease-expiry transition tests, retention policy/count tests, local migration deployment, and full quality gate passed. |
| L5.4 | Bound production worker concurrency | Complete | Worker concurrency is an explicit 1–20 setting with a safe default, process-level enforcement, environment validation, and readiness visibility. GitHub Actions run 40115210885 passed Redis integration for worker handoff, enforced concurrency, and persisted workflow execution. |
| L5.5 | Enforce the live execution boundary server-side | Complete locally | Controller tests prove unconfirmed live runs are rejected and confirmed runs queue correctly; runtime credential requirements include Steam, Google Chat, Drive/Sheets, HTTP, and optional approval notification credentials. Full quality gate passed. |
| L5.6 | Surface runtime health in the workflow dashboard | Complete locally | Dashboard requests readiness and distinguishes ready, degraded, and unreachable API states alongside queue activity; Playwright verifies ready state after sign-in. Full quality gate passed. |

## External-boundary rule

Real Steam, Google Chat, and Google OAuth calls are enabled only after a user supplies their credentials through the application. Until then, adapters use deterministic mock transport; no secret belongs in source, tests, logs, or frontend state.

See [`07-local-mvp-acceptance-audit.md`](./07-local-mvp-acceptance-audit.md) for the requirement-by-requirement evidence and the deliberately deferred external validations.
