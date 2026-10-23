# Local MVP Acceptance Audit

This document is the current, evidence-based audit for the local MVP. It intentionally does not treat a mock transport or unconfigured external provider as a real-provider verification.

| Acceptance criterion | Local status | Evidence |
|---|---|---|
| Workspace, draft save, immutable publish | Verified | Owner-only API flow; editor library creates/selects workspaces and blank/template workflows; publishing produces an immutable published version plus a new draft. Version-history E2E observed published v1 and draft v2. |
| Add, configure, connect, validate nodes | Verified | React Flow editor has palette, structured forms (including Switch case-to-edge mappings), JSON configuration, client DAG validation with detailed error/warning feedback, import/export, and backend graph validation. |
| Manual, cron, webhook triggers create executions | Verified locally | Manual trigger E2E with test data, editor endpoint creation/rotation UI, webhook E2E with hashed secret plus hash-match unit coverage, and cron scheduler test that creates/dispatches one due execution with deduplication. |
| Steam → Google Chat daily report | Mock verified; real-provider verification deferred | Template, deterministic mock executors, backend-only live adapters, and encrypted credentials exist. A real report requires the owner's Steam API key and Google Chat incoming webhook. |
| Execution inspector detail | Verified | Persisted node status, attempts, duration, redacted input/output/error; editor displays input and output/error as tree, table, or raw JSON. |
| Timeout, retry, and error branch | Verified locally | HTTP E2E: `NETWORK_ERROR` retried twice, routed by error edge, then paused at Approval. |
| Approval pause/resume and cancellation | Verified locally | Approval E2E pause/resume/reject; authenticated approval links resolve the owning workflow/execution and select the waiting node; an encrypted HTTP-webhook notification E2E verifies its headers and app link on a live run; cancellation E2E turns a waiting run into `CANCELLED` and skips pending/waiting node work. |
| Export/import, clone, version history, sample-data test run | Verified locally | Editor import/export and clone actions, version-history panel/API, system Steam template, and Manual Trigger JSON test data. |
| No credential values in normal API/UI persistence paths | Verified by implementation and focused tests | AES-256-GCM vault, credential summaries only, redaction test, and backend-only provider calls. Login, credential, workflow publish, manual execution, and cancellation actions are written to audit logs. This is not a replacement for an independent security audit. |
| Quality gate | Verified | `npm run verify`: Prisma validation, unit tests, lint, TypeScript checks, and production build. |

## Deferred external validation

- **Redis/BullMQ process E2E:** queue and worker code are present, but this machine has neither `redis-server` nor Docker. Inline mode is the verified local default.
- **Real providers:** Steam, Google Chat, Google OAuth, Drive, and Sheets require credentials owned and supplied by the user. No secret is stored in source or test fixtures.
- **Deployment/VPS:** intentionally deferred by product scope.

## Remaining local hardening candidates

1. Add a container or local Redis runtime, then validate the separate API/worker path.
2. Add independent browser E2E coverage for editor interactions.
3. Perform a dedicated security review before any external deployment.
