# Local MVP Acceptance Audit

This document is the current, evidence-based audit for the local MVP. It intentionally does not treat a mock transport or unconfigured external provider as a real-provider verification.

| Acceptance criterion | Local status | Evidence |
|---|---|---|
| Workspace, draft save, immutable publish | Verified | Owner-only API flow; editor library creates/selects workspaces and blank/template workflows; publishing produces an immutable published version plus a new draft. Browser E2E saves a draft, publishes v1, and opens version history. |
| Email/password, Google, GitHub, and Steam account identity | Verified locally | Password sessions and social identity lifecycle have focused coverage. Browser checks have completed for Google sign-in, GitHub authorization-code sign-in, and Steam OpenID linking with user-owned local provider configuration; the dashboard displays all three linked identities. |
| Add, configure, connect, validate nodes | Verified | React Flow editor has palette, structured forms (including Switch case-to-edge mappings), JSON configuration, client DAG validation with detailed error/warning feedback, import/export, and backend graph validation. Local If/Else and Switch E2Es confirm only the selected branch executes. |
| Manual, cron, webhook triggers create executions | Verified locally | Manual trigger E2E with test data, editor endpoint creation/rotation UI, webhook E2E with hashed secret plus hash-match unit coverage, and cron scheduler test that creates/dispatches one due execution with durable occurrence-key deduplication. Public webhooks optionally accept endpoint-scoped `Idempotency-Key`. |
| Steam → Google Chat daily report | Mock verified; real-provider verification deferred | Template, deterministic mock executors, backend-only live adapters, and encrypted credentials exist. Steam unit coverage mocks profile/current/owned/recent/achievements API responses. A real report requires the owner's Steam API key and Google Chat incoming webhook. |
| Execution inspector detail | Verified | Persisted node status, attempts, duration, redacted input/output/error; editor displays input and output/error as tree, table, or raw JSON. It also supports safe mock-only single-node debug and execution-detail deep links that retain the immutable run graph. |
| Execution operations dashboard | Verified locally | The collapsed-by-default Execution Center shows runtime health, filters attention/in-progress/failed/succeeded runs, handles its own loading/error/retry state, deep-links the exact execution, and cursor-paginates further history without replacing existing rows. |
| Safe execution retry | Verified locally | Only failed executions can be retried from their original pinned version and redacted trigger data. Mock retry stays external-call-free; live retry needs fresh confirmation plus a credential readiness re-check, and warns that a provider may already have accepted a prior request. |
| Timeout, retry, and error branch | Verified locally | HTTP E2E: `NETWORK_ERROR` retried twice, routed by error edge, then paused at Approval. |
| Approval pause/resume and cancellation | Verified locally | Approval E2E pause/resume/reject; authenticated approval links resolve the owning workflow/execution and select the waiting node; an encrypted HTTP-webhook notification E2E verifies its headers and app link on a live run; cancellation E2E turns a waiting run into `CANCELLED` and skips pending/waiting node work. |
| Export/import, clone, version history, sample-data test run | Verified locally | Editor import/export and clone actions, version-history panel/API, system Steam template, and Manual Trigger JSON test data. |
| No credential values in normal API/UI persistence paths | Verified by implementation and focused tests | AES-256-GCM vault, credential summaries only, provider-aware connection selection, redaction test, and backend-only provider calls. Login, credential, workflow publish, manual execution, and cancellation actions are written to audit logs. This is not a replacement for an independent security audit. |
| Quality gate | Verified | `npm run verify`: Prisma validation, unit tests, lint, TypeScript checks, production build, and Playwright browser E2E. CI provisions PostgreSQL and Chromium before running the same gate. |

## Deferred external validation

- **Redis/BullMQ process E2E:** queue and worker code are present, but this machine has neither `redis-server` nor Docker. Inline mode is the verified local default.
- **Real providers:** Google and GitHub account sign-in plus Steam identity linking have been verified locally with user-owned accounts. Steam Web API, Google Chat, Google connector OAuth, Drive, and Sheets still require their own user-owned credentials and live smoke checks. No secret is stored in source or test fixtures.
- **Deployment/VPS:** the production foundation is now present in `infra/`; first rollout remains operator-gated on the real HTTPS domains, GitHub/VPS secrets, and a separate production credential decision.

## Remaining local hardening candidates

1. Add a container or local Redis runtime, then validate the separate API/worker path.
2. Perform a dedicated security review before any external deployment.
