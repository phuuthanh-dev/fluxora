# GitHub Issue Opened Trigger

## Identity

- Task ID: `2026-10-28-github-issue-opened-trigger`
- Base commit: `503027e`
- Working branch: `codex/github-connector-p2-1a`
- Implementer: `Codex`
- Reviewer: `Codex review + owner approval`

## Outcome

Add a separately discoverable `GitHub → Issue opened` trigger on the existing
webhook endpoint, with raw-body HMAC verification and workspace-owned GitHub
connector credentials.

## Target slice IDs

- `P2-1`

The completed implementation will be recorded as ledger evidence L11.11 after
the quality gate passes.

## In scope

- Add a stable `trigger.github.issue-opened` contract and App → Operation
  catalog entry.
- Reuse the existing webhook endpoint lifecycle and published workflow pinning.
- Require the selected workspace GitHub credential to contain `webhookSecret`;
  verify `X-Hub-Signature-256` against the raw request body with HMAC-SHA256.
- Accept only the `issues` event with `action: opened`, then dispatch the
  verified payload as the workflow trigger data.
- Keep GitHub account-login OAuth separate from connector credentials.
- Add focused API/web tests and update spec, architecture, and loop ledger.

## Explicitly out of scope

- GitHub webhook registration through the GitHub API.
- Other GitHub events (`pull_request`, `push`, `workflow_run`) in this slice.
- Real GitHub webhook delivery, real credentials, deployment, or production
  configuration.

## Acceptance criteria

- [x] The trigger is discoverable and configurable with a GitHub connector
  credential and stable issue-opened event defaults.
- [x] Endpoint creation rejects a missing `webhookSecret` without exposing it.
- [x] Valid raw-body signature and matching event/action dispatch the payload.
- [x] Tampered signatures and mismatched actions are rejected before dispatch.
- [x] `npm run verify` passes without real credentials or provider calls.

## Required evidence

- Tests to add or update: `apps/api/src/webhooks/webhook.service.test.ts`,
  `apps/api/src/execution/live-readiness.test.ts`,
  `apps/web/src/features/workflow/workflow-graph-schema.test.ts`.
- Commands to run: `npm run agent:task:check -- .agent/tasks/2026-10-28-github-issue-opened-trigger.md`,
  `npm run verify`.
- UI/manual proof: trigger catalog, credential field, and endpoint guidance are
  covered by source contract/type checks; no real provider call is permitted.

## Safety boundaries

- Read `AGENTS.md`, `docs/06-loop-engineering.md`, `docs/10-agent-harness.md`,
  and `docs/11-code-graph.md` before editing.
- Do not use, print, commit, or request real provider credentials.
- Do not deploy, publish, merge, alter CI secrets, or make external provider
  calls.
- Update `docs/11-code-graph.json` with `npm run codegraph:generate` when source
  dependencies change.
- Produce a commit and a report using `.agent/report-template.md`.
