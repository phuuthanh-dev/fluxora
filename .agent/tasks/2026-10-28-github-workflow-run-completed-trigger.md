# GitHub Workflow Run Completed Trigger

## Identity

- Date: 2026-10-28
- Base commit: `4fa8cff`
- Branch: `codex/github-connector-p2-1a`
- Target slice: `P2-1`
- Planned ledger row: `L11.14`

## Outcome

Add a separately discoverable `GitHub → Workflow run completed` trigger on the
existing published webhook endpoint, using the workspace-owned encrypted GitHub
connector credential and signed raw-body verification.

## Target slice IDs

- `P2-1`

The completed implementation will be recorded as ledger evidence L11.14 after
the quality gate passes.

## Acceptance criteria

- [x] Add a stable `trigger.github.workflow-run-completed` contract and App → Trigger catalog entry.
- [x] Require the selected workspace GitHub credential to contain `webhookSecret`.
- [x] Accept only the `workflow_run` event with `action: completed` and dispatch the verified payload.
- [x] Reject tampered signatures and mismatched event/action before queueing.
- [x] Keep GitHub account-login OAuth separate from connector credentials.
- [x] Add focused API/web tests and update spec, architecture, and loop ledger.
- [x] Pass `npm run verify` with no real GitHub calls or credentials.

## Explicitly out of scope

- GitHub webhook registration through the GitHub API.
- Other GitHub events or additional operations in this slice.
- Real GitHub webhook delivery, real credentials, deployment, PR creation, or merge.
