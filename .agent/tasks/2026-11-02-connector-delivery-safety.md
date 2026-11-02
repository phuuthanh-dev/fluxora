# NX-01: connector delivery and response safety

## Identity
- Task ID: `2026-11-02-connector-delivery-safety`
- Base: `6010e4e` (audit), runtime base `04d67b6`.
- Branch: `codex/connector-delivery-safety`; local worker branches only.
- Owner requested multi-agent implementation and one final verify/release batch.

## Target slice IDs
- `APP-EXPANSION-1`

## Outcome
Existing connector writes must not be automatically replayed after an ambiguous
result; explicit adapter retry decisions survive the runner. SMTP reports server
acceptance accurately, and HTTP/Drive/Sheets reads have streaming response limits.
Evidence: docs/37 NX-01, A1–A3. This does not add new apps, node operations or an
exactly-once promise.

## Work ownership
All workers use isolated worktrees from the base, inherit the current model,
read AGENTS and mandatory docs, and receive this contract by absolute path.
No worker reads secrets/user data, performs provider calls, runs validation,
changes dependencies, commits, pushes, creates PRs, deploys or spawns agents.
Write tests but leave their execution to the coordinator's final gate.

- SMTP worker: `apps/api/src/execution/smtp-email.ts` and `.test.ts` only.
- Response worker: `apps/api/src/execution/provider-json.ts` and a focused
  `provider-json.test.ts` only. Add `readBoundedProviderText(response)` export
  with a shared 1,000,000-byte limit; keep JSON export and callers compatible.
- Notification worker: `apps/api/src/notifications/` adapters/transport helpers
  and `apps/api/src/execution/notifications.test.ts`, plus
  `google-chat-oauth.ts` / `.test.ts` only. Exclude SMTP and execution.service.
- Coordinator: runner/retry, HTTP/Drive/Sheets/GitHub paths, integration tests,
  docs, codegraph, review, final isolated verification and release.

## Acceptance criteria
- [x] Explicit `retryable:false` remains false even for HTTP 5xx/network codes;
  retryable reads and confirmed temporary rejections retain bounded retries.
- [x] Ambiguous outbound creates/messages/appends/comments are not blindly
  retried; existing Calendar reconciliation and Mongo/Trello guards preserved.
- [x] SMTP all-accepted is distinguished from partial/unconfirmed delivery;
  no inbox-delivery promise, no recipient/credential leakage, no replay on
  partial or uncertain submission. Existing success output keys remain usable.
- [x] HTTP and Drive/Sheets response bodies are bounded while streaming even
  without truthful Content-Length; malformed/oversized accepted-write receipts
  cannot cause replay. Successful output shapes remain compatible.
- [x] Regression tests cover runner+adapter interactions, side-effect request
  counts, error branches, response cancellation/UTF-8 and SMTP receipts.
- [x] All changes integrated before final `npm run verify`; no real providers.
- Release gate: one develop→main PR reviewed and merged only after quality gate/CI pass;
  deployment monitored and exact final status recorded.

## Boundaries
No credential/schema migration, provider permissions, polling/loop engine,
new library, broad node-registry rewrite, or unrelated UI redesign. Preserve
preexisting `apps/web/next-env.d.ts` and local data. Keep local preview available;
scheduler off in local process only during this work. User's final-only verify
instruction overrides per-worker test cadence in the harness.
