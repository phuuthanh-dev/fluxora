# NX-07 summary notification regression

## Identity

- Task ID: `2026-11-06-nx07-summary-regression`
- Base commit: `5c4069dc6d5840b8c4a1a3ac7dab82d2dde6e208`
- Working branch: `develop` (local; publish through the existing develop-to-main flow)
- Implementer and reviewer: Codex

## Outcome

Fix duplicate notifications from the five existing data-read summary templates
after PR #92 introduced automatic per-item execution. A synthetic PostgreSQL
check reproduced two identical Google Chat actions for two rows; no real
provider was called. n8n's node setting Execute Once processes the first item.

## Target slice IDs

- `APP-EXPANSION-1`

## In scope

- Add one explicit static action-node setting for first-item-only execution,
  and make the five existing summary templates opt into it.
- Reuse the existing inspector controls, validate the setting and keep ordinary
  node execution per item by default. An empty list still runs no action.
- Add focused synthetic regression and UI coverage; update existing docs.

## Explicitly out of scope

- New connectors, node versions, branching, binary data, and changes to existing
  saved workflows or credentials. No real provider requests.

## Acceptance criteria

- [x] A two-item input produces one summary with the setting enabled and two
  actions by default; invalid setting values do not silently send messages.
- [x] Existing summary templates enable the setting and explain empty lists.
- [x] The inspector offers the setting in Advanced using existing components.
- [ ] Local verification passed after the batch; release uses one develop PR.

## Required evidence and safety

- Tests use synthetic data; no provider secrets or real sends.
- Preserve user data and unrelated worktrees. Keep local scheduler disabled.
- `npm run codegraph:generate` if imports change; run `npm run verify` at end.
