# NX-07: route item lists through conditions

## Identity

- Task ID: `2026-11-06-nx07-item-conditions`
- Base commit: `0df5598` (local develop)
- Working branch: `develop`
- Implementer and reviewer: Codex

## Outcome

Permit the existing If and Switch nodes to route each incoming item to the matching output, preserving its JSON and parent-item link. n8n documents conditional workflow splitting at https://docs.n8n.io/build/flow-logic/split-with-conditionals/ .

## Target slice IDs

- `APP-EXPANSION-1`

## In scope

- Extend the bounded item engine to support conditions and their separate output paths.
- Preserve ordinary non-item graph execution, limits, cancellation, input redaction, and node/item statuses.
- Fix the confirmed PR #93 regression where the runner-only `executeOnce` setting is passed to PostgreSQL and Supabase adapters that reject unknown fields.
- Add synthetic engine-level tests for mixed routes, empty routes, invalid conditions, and regression of unsupported joins and approvals.
- Update existing specs to state the supported subset and remaining boundaries.

## Explicitly out of scope

- New nodes, user-facing settings, database change triggers, binary storage, live provider requests, parallel node versions, and automatic workflow rewrites.
- Full n8n parity, joins, approval continuations across item paths, or changes to provider credentials.

## Acceptance criteria

- [x] For an item list, If and Switch evaluate expressions per input item, send the original item to its matching output, and never execute an empty output.
- [x] A failed condition prevents its successors from running and records the failure without replaying prior writes.
- [x] Unsupported joins and approvals are rejected before any node runs.
- [x] Existing single-action item paths and non-item graphs retain their established semantics.
- [x] Final batch `npm run verify` passed before PR #94 from develop to main.

## Required evidence and safety

- Use mock providers and an isolated local database, never real external effects.
- Preserve local scheduler disabled and unrelated worktrees and data.
- Generate the code graph if imports change. Verification is deferred until the end of the batch at the owner's request.
