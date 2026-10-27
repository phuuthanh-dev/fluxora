# GitHub Pull Request Opened Trigger

## Identity

- Date: 2026-10-28
- Base commit: `68ca3c8`
- Branch: `codex/github-connector-p2-1a`
- Target slice: `P2-1`
- Planned ledger row: `L11.12`

## Outcome

Add a separately discoverable `GitHub → Pull request opened` trigger on the
existing published webhook endpoint, using the workspace-owned encrypted GitHub
connector credential and the same signed raw-body verification boundary as the
Issue opened trigger.

## Target slice IDs

- `P2-1`

The completed implementation will be recorded as ledger evidence L11.12 after
the quality gate passes.

## Acceptance criteria

- [x] Add a stable `trigger.github.pull-request-opened` contract and App → Trigger catalog entry.
- [x] Require the selected workspace GitHub credential to contain `webhookSecret`.
- [x] Accept only the `pull_request` event with `action: opened` and dispatch the verified payload.
- [x] Reject tampered signatures and mismatched event/action before queueing.
- [x] Keep GitHub account-login OAuth separate from connector credentials.
- [x] Add focused API/web tests and update spec, architecture, and loop ledger.
- [x] Pass `npm run verify` with no real GitHub calls or credentials.

## Explicitly out of scope

- GitHub webhook registration through the GitHub API.
- Other GitHub events (`push`, `workflow_run`) in this slice.
- Real GitHub webhook delivery, real credentials, deployment, PR creation, or merge.
