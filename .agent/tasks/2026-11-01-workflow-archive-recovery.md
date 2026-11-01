# Workflow archive recovery

## Identity

- Task ID: `2026-11-01-workflow-archive-recovery`
- Base commit: `96ac696b141dbda4a5395088b09e4796a187f820`
- Working branch: `codex/workflow-archive-recovery`
- Implementer: Codex; reviewer: independent diff and test review.

## Target slice IDs

- `L6.11`

## Reopen justification

Archive hides a workflow from the workspace list (`WorkflowService.list`) but
the product exposes no archived list or restore operation. This makes saved
workflows appear to disappear and leaves no user-facing recovery path.

## Outcome

Let owners find archived workflows and restore them in the same workspace.

## In scope

- Owner-scoped archived listing and atomic restore with an audit event.
- Dashboard archived view, loading/error/empty states, and restore action.
- Restores preserve versions/history and always leave workflows inactive.

## Explicitly out of scope

- Production data changes, backup/restore operations, bulk actions, schema
  migrations, permanent-deletion semantics, and automatic live activation.

## Acceptance criteria

- [x] Owners can list and restore archived workflows in their own workspace.
- [x] Restoring cannot reactivate schedules or webhook executions automatically.
- [x] Missing, unauthorized or already-restored workflows do not change data.
- [x] Restores preserve draft, published versions and execution history.
- [x] UI clearly distinguishes archived items and supports dark/light themes.

## Required evidence

- Unit tests for ownership and restore concurrency, plus browser coverage.
- `npm run verify` in isolated local infrastructure.
