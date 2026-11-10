# Task contract

## Identity
- Task ID: `2026-11-10-jira-privacy-response`
- Base commit: `3a92607a4bef480c82e85a77bdb69f045827ca15`
- Working branch: `codex/jira-privacy-response`; remote develop→main only.
- Implementer/reviewer: Codex directly.

## Target slice IDs
- `APP-EXPANSION-1`
- `CONNECTOR-LIVE-2`

## Outcome
Complete the Jira reporting response process and qualify production OAuth. Reuse
the existing ledger, vault, owner checks, platform Admin and execution records.
Both closed and updated responses use reviewed erasure, not speculative refresh.

## Acceptance criteria
- [x] Durable connection/workspace attribution survives connection deletion; legacy gaps are explicit.
- [x] Admin-only metadata list, bounded dry-run and snapshot-bound response confirmation; no raw account IDs, tokens or payloads returned.
- [x] Block active workflows/executions, changed previews and unreviewed copies. Scrub identified execution/node/item payloads, retain statuses/timings, remove matching connections and the resolved reporting account atomically.
- [x] Erased executions cannot be retried; normal execution and OAuth ownership remain intact.
- [x] Uncertain reporting has an explicit operator recovery boundary and does not silently replay.
- [ ] Meaningful protocol, response, concurrency/authorization and both-theme Admin tests; audit then npm run verify at the end.
- [ ] Production OAuth/read evidence, truthful retention/copy limitations, one PR/merge after CI and deploy evidence.

## Safety boundaries
User authorizes this implementation/release and bounded provider qualification.
Real erasure/reporting activation requires a concrete review at the final step.
No automatic broad purge, no arbitrary-text identity inference, no mutation of
immutable workflow graphs, no claim that external services/backups are erased.
Preserve unrelated next-env and unknown data. Local web/API stay available with
scheduler disabled. No new app, engine, node version, dependency or subagent.

## Pre-release evidence
- Real production OAuth/read and vendor active/closed reporting test results: docs/51.
- Local API1175 passes/1 optional skip, web76 passes, typecheck/build and security/schema gates passed; privacy PostgreSQL response/race/retry tests passed.
- Browser full228/231; targeted corrections8/9. The unchanged ribbon GPU step bound remains a local failure. Both new privacy-theme screenshots and contrast checks passed after UI correction.
- Final release acceptance remains open until exact-head full CI verification, merge and deployment. Do not reopen implemented features merely because this source-time release checkbox is pending; inspect the associated PR's current state.
