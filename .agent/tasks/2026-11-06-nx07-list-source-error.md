# NX-07: restore list-source error branches

## Identity

- Task ID: `2026-11-06-nx07-list-source-error`
- Base commit: `05a2e23a2a6e6b7d82fc6c7d149420e3b097b64b`
- Working branch: `develop`
- Implementer and reviewer: Codex

## Outcome

Restore the existing action error branch when a list source fails before it
produces items. PR #92 introduced a preflight that rejects any error edge from
list sources before the source can execute. Error handling is a product-spec
requirement, and this restores that existing graph behavior without enabling
per-item error handling or adding a new node setting.

## Target slice IDs

- `APP-EXPANSION-1`

## In scope

- Permit a list source's error edges only for a source without item inputs.
- Route source failure and invalid list-output failure through an existing error
  branch; without one, fail as before. On success, continue processing items.
- Preserve rejection of error edges on per-item action paths, joins, approvals,
  and all provider retry and uncertain-write behavior.
- Add isolated mock and PostgreSQL integration coverage and update relevant
  documentation with the actual boundary.

## Explicitly out of scope

- Per-item error continuation, joins, approval continuations, binary storage,
  new connectors/settings, old workflow migration and real provider calls.

## Acceptance criteria

- [ ] A failing source with an error edge executes that branch and does not run
  its success branch; a valid source executes only its success path.
- [ ] Invalid/oversized source item output follows the same error-branch rule.
- [ ] A failing source without an error edge fails the execution.
- [ ] An error edge on an action that processes items is rejected before nodes
  run; unsupported joins and approval paths remain rejected.
- [ ] Verify the complete batch once, then use a single develop-to-main PR.

## Safety boundaries

- Use mock providers and disposable local test data; no real external effects.
- Preserve credentials, workflows, unrelated worktrees and production data.
- Keep the local scheduler disabled. Generate the code graph if imports change.
