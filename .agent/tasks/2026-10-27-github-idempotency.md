# Task contract

## Identity

- Task ID: `2026-10-27-github-idempotency`
- Base commit: `2871cef`
- Working branch: `codex/github-connector-p2-1a`
- Implementer: `Codex`
- Reviewer: `Codex`

## Outcome

Deliver the next P2-1 vertical slice: make GitHub Create Issue retries safer with an explicit connector-level idempotency guard, without pretending that GitHub's Issues API supports native idempotency keys.

## Target slice IDs

- `P2-1`

## In scope

- Add an optional idempotency-key field to the GitHub Create Issue node.
- Validate the key as bounded visible ASCII and never expose the raw key in provider output.
- Hash the key into a hidden stable marker, search GitHub before creating, and return the existing issue when the marker is found.
- Preserve mock safety, fixed GitHub API hosts, server-side credentials, timeout, retry classification, and redaction.
- Add focused tests and update product/architecture/loop state documentation.

## Explicitly out of scope

- Native GitHub idempotency support (the Issues API does not provide it).
- Webhook triggers, comments, labels, merge, releases, GitHub App installation, or other operations.
- Real GitHub calls or real credentials in tests, CI, or browser automation.

## Acceptance criteria

- [x] Create Issue exposes an optional idempotency key.
- [x] The key is validated and hashed before it can affect a provider request.
- [x] A matching issue is returned without a second create request.
- [x] A missing match proceeds to create with a hidden marker, without token/key logging.
- [x] Mock mode and invalid-key paths make no provider call.
- [x] Focused tests and the full quality gate pass with no real provider calls.

## Required evidence

- Tests: `apps/api/src/execution/github.test.ts` and the GitHub node catalog contract test.
- Commands: task check, focused tests, `npm run verify`, `git diff --check`.
- UI/manual proof: inspect the optional idempotency field locally; do not save real provider credentials.

## Safety boundaries

- No provider credentials or real external calls.
- No deploy, merge, CI secret changes, or provider OAuth changes.
