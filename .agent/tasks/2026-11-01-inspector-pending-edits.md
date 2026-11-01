# Inspector pending-edit safety

## Identity
- Task ID: `2026-11-01-inspector-pending-edits`
- Base commit: `354bd4d`
- Working branch: `codex/guided-filter-safety`
- Implementer: Codex; reviewer: owner.

## Target slice IDs
- `EDITOR-QUALIFICATION-1`

## Outcome
Prevent unsubmitted MongoDB conditions and shared inspector edits from being
silently lost or allowing old configurations to run.

## In scope
- Shared staged edit lifecycle across inspector node configurations.
- Preserve drafts while selecting nodes; block actions until apply/discard.
- Verify keyboard, switching nodes, mock execution and both theme states.
- Audit other app configuration gaps and document prioritized follow-up.

## Explicitly out of scope
- Real provider mutations, new connectors, production deployment.

## Acceptance criteria
- [ ] Pending conditions and inspector JSON are preserved on node switching.
- [ ] Saving, publishing, debugging, test and live runs cannot silently use stale data.
- [ ] Applied and discarded changes unblock controls without altering unrelated configs.
- [ ] Relevant tests, final isolated verification and cross-app audit are recorded.

## Required evidence
- Tests to add or update: browser staged edits across nodes and providers.
- Commands to run: `npm run agent:task:check` and `npm run verify`.
- UI/manual proof: pending state and accessible actions.

## Safety boundaries
- No secret values or real provider payloads in tests, logs, or reports.
- No writes to a real MongoDB collection unless its exact target is confirmed.
