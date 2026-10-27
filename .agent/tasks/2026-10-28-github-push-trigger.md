# GitHub Push Trigger

## Identity

- Date: 2026-10-28
- Base commit: `8aabefb`
- Branch: `codex/github-connector-p2-1a`
- Target slice: `P2-1`
- Planned ledger row: `L11.13`

## Outcome

Add a separately discoverable `GitHub → Push` trigger on the existing published
webhook endpoint. It uses the workspace-owned encrypted GitHub connector
credential and verifies the signed raw-body event without assuming an action
field, because GitHub push payloads are event-only.

## Target slice IDs

- `P2-1`

The completed implementation will be recorded as ledger evidence L11.13 after
the quality gate passes.

## Acceptance criteria

- [x] Add a stable `trigger.github.push` contract and App → Trigger catalog entry.
- [x] Require the selected workspace GitHub credential to contain `webhookSecret`.
- [x] Accept only the `push` event and dispatch the verified payload without requiring `payload.action`.
- [x] Reject tampered signatures and mismatched events before queueing.
- [x] Keep GitHub account-login OAuth separate from connector credentials.
- [x] Add focused API/web tests and update spec, architecture, and loop ledger.
- [x] Pass `npm run verify` with no real GitHub calls or credentials.

## Explicitly out of scope

- GitHub webhook registration through the GitHub API.
- The `workflow_run` event or additional GitHub operations in this slice.
- Real GitHub webhook delivery, real credentials, deployment, PR creation, or merge.
