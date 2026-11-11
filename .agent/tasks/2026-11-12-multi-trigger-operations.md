# Multi-trigger and production operations

## Identity

- Task ID: `2026-11-12-multi-trigger-operations`
- Base commit: `8fea1e377b8c01247b002b7aa30e85fa8e64c7af`
- Working branch: `develop` (owner's single-branch workflow)
- Implementer and reviewer: Codex; no delegated agents

## Outcome

Extend multiple-trigger support beyond Steam with safe per-trigger execution and credential isolation; qualify existing OAuth, recovery, monitoring and capacity after VPS migration.

## Target slice IDs

- `MULTI-TRIGGER-1` — owner-approved expansion beyond its released Steam subset.
- `CONNECTOR-LIVE-2` — bounded post-migration OAuth qualification using authorized resources.
- `OPS-1` — current database backup, isolated restore, operational monitoring and measured capacity evidence.

## In scope

- Trigger identity, registration, delivery, recovery, checkpoint and UI behavior necessary for supported combinations.
- Scoped credential readiness and failure behavior for the selected branch.
- Existing OAuth configuration and bounded read-only provider validation; backup and restore of the current production database; observation and safe synthetic load.
- Relevant product, architecture and current state documentation.

## Explicitly out of scope

- New connectors, unrelated redesign, destructive production data edits, unapproved messages, secrets in source or logs, and unsupported claims of full provider coverage or 100-user capacity.

## Acceptance criteria

- [ ] Distinct trigger events execute only the intended branch, with independently maintained registrations/checkpoints and credential checks.
- [ ] Existing deployed Steam workflow remains intact and other event types fail closed until supported.
- [ ] OAuth checks report actual provider outcomes and unresolved permissions honestly.
- [ ] A current production backup is stored outside the VPS and an isolated restore is demonstrated; recurring backup limitations are documented.
- [ ] Readiness, monitoring and capacity evidence state actual conditions and limitations.
- [ ] One batch receives final audit and `npm run verify`; one develop-to-main PR is merged only after checks.

## Current evidence and remaining work — 2026-11-12

- Existing production behavior remains bounded to one Schedule plus Steam News. The broader local implementation records trigger identity for Gmail, Calendar, polling and webhook executions, scopes event readiness to reachable nodes, and maintains per-node webhook endpoints and polling checkpoints.
- The expanded graph boundary, provider lifecycle changes and test coverage passed isolated local `npm run verify` (1,218 API passes, one optional skip, 76 web passes, 245 Playwright passes). Two additional CI rollback integration checks passed. The editor's webhook setup was inspected visually. Production's four existing endpoints each have one identifiable trigger, but migration and real mixed-provider delivery remain unqualified until release.
- n8n distinguishes trigger operations from actions and uses Redis workers for execution; compare [node controls](https://docs.n8n.io/workflows/components/nodes/) and [queue mode](https://docs.n8n.io/hosting/scaling/queue-mode/). Do not infer implementation details of n8n from Fluxora.
- A live read-only Jira issue query and a Notion test-page search succeeded on the new VPS; both manual workflows were restored to inactive. Slack's picker loaded the test channel and Google Calendar's picker loaded the test calendar. These do not establish sending, event delivery, login, or Drive/Sheets behavior.
- A PostgreSQL archive was copied to the owner's Mac, isolated restore passed, the saved encryption key matches production, and a daily Mac launch agent successfully ran once. This needs an available Mac and network, is not independent cloud storage, and is not an application/credential-decryption restore rehearsal.
- Production health and readiness returned HTTP 200; a bounded 20-request readiness probe at concurrency 2 had 20 successes, median 130 ms, p95 151 ms. It does not establish capacity for 100 users or test realistic workflow load. Production had 24 GB disk and 2.7 GiB RAM available at the observation time.

## Safety boundaries

User explicitly authorizes OAuth validation, database backup, deployment, PR and merge for this batch. Never output secrets or send provider messages without separate explicit instruction. Preserve existing workflow data and pre-existing `apps/web/next-env.d.ts` changes. Inspect schedules/configuration before modifying them; no destructive production data operations or unbounded load.
