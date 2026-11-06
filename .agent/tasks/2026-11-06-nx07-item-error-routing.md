# NX-07: route individual failed items

## Identity

- Task ID: `2026-11-06-nx07-item-error-routing`
- Base commit: `21965cd023d3786ccfff2bf87205ce194b18f4d2`
- Working branch: `develop`
- Implementer and reviewer: Codex

## Outcome

The owner explicitly chose n8n-style item routing when an action's Error output
is connected: failed items go to Error and remaining successful items to Success.
Without an Error connection a failed item stops the workflow. This extends the
existing handles; no additional node or user setting is introduced.

n8n documentation: https://docs.n8n.io/build/understand-workflows/workflow-components/work-with-nodes/#node-settings

## Target slice IDs

- `APP-EXPANSION-1`

## In scope

- Partition per-item action results by Success/Error, preserving the original
  item and immediate parent link for failures, and include a sanitized error.
- Retry only according to existing adapter policy; never retry uncertain writes.
- Preserve fail-fast behavior without Error, cancellation/lease fencing,
  100-item/1 MB limits, and red node status for handled failures.
- Cover mixed results, all-success/all-failure, retries, cancellation, uncertain
  writes, no-error stop, and no secret leakage with synthetic test data.

## Explicitly out of scope

- Joins, approval continuations, binary storage, new connector settings,
  older workflow rewrites, real provider calls and claims of full n8n parity.

## Acceptance criteria

- [x] With an Error connection, a failed item goes to Error while successful
  items—including later items—go to Success; empty branches do not run.
- [x] Without Error, processing stops on the first failure and remaining items
  are skipped; the node is red and the execution fails.
- [x] A handled failed item remains visible as failed; output error data does not
  contain credential values or arbitrary provider/exception messages.
- [x] Uncertain writes are not retried automatically. Cancellation, lease loss,
  unsupported joins/approvals and global limits retain their guardrails.
- [x] Verify the full batch once before one develop-to-main PR.

## Safety boundaries

- No real provider calls, credentials or side effects. Isolated test database.
- Preserve unrelated worktrees and production data; scheduler local remains off.
- Run the full `npm run verify` at the end of the batch as the owner requested.
