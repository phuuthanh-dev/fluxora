# Task contract — credential lifecycle

## Identity

- Task ID: `2026-10-25-credential-lifecycle`
- Base commit: `c2282415240a0e4779c3b5c596e57dc47245f7ac`
- Working branch: `codex/credential-lifecycle`
- Implementer: Antigravity using Gemini 3.8 Flash (Medium reasoning)
- Reviewer: Codex

## Outcome

An owner can rename or rotate an encrypted manual credential while preserving its ID and node bindings, and can delete it only when no current workflow or active execution needs it.

## In scope

- Add owner-protected credential update and deletion endpoints under the existing workspace credential route.
- Keep a credential's provider and ID immutable. Update may rename it, replace its complete encrypted secret payload, or do both; it must never return decrypted data.
- Emit audit events for rename/rotation/deletion without secret values or secret-derived metadata.
- Convert duplicate `(workspaceId, provider, label)` conflicts for create and update into a stable, user-facing conflict response instead of an unhandled API error.
- Add safe reference inspection before deletion. Block deletion with a stable `CREDENTIAL_IN_USE` error and minimal reference details when the credential is used by a workflow's *current* draft or published version, or by an active queued/running/waiting execution. Historic versions that are not current and have no active execution must not permanently prevent cleanup.
- Scan both `credentialId` and `notificationCredentialId` configuration fields; do not delete a credential based on a label match.
- Build credential-manager UI actions grouped on each credential: Rename, Rotate secret, and Delete. Rotation must clearly state that the old secret cannot be displayed and requires a full replacement JSON payload. Deletion must use an explicit confirmation view and display API reference blockers accessibly.
- Preserve selected node bindings after rename/rotation because the ID remains unchanged; refresh the credential list after a successful mutation.
- Show duplicate-label and deletion-blocked errors inline, preserving form input. Do not show a generic unexpected-error message for expected credential conflicts.
- Preserve the existing Google OAuth connect path. Do not expose raw OAuth secrets. If an OAuth-managed credential is identified in the UI, direct the owner to reconnect through OAuth rather than manually rotating it.
- Update product/implementation/loop docs only where this delivered user behavior needs recording, regenerate the code graph if imports change, and write a factual handoff report.

## Explicitly out of scope

- Provider OAuth redesign, token validation against live providers, bulk credential operations, RBAC changes, credential sharing, secret viewing/export, changing workflow graphs automatically, migration/schema changes unless demonstrably necessary, deployment, CI secrets, PR creation, and merging.
- Real provider credentials, API calls, or external side effects.
- Touching the existing uncommitted `apps/web/next-env.d.ts` generated-file change; it is outside this task and must not be committed.

## Acceptance criteria

- [ ] The API supports credential rename/secret rotation while retaining provider and ID, encrypting replacement data, returning summaries only, and writing redacted audit records.
- [ ] Duplicate labels yield a stable conflict message for both create and rename rather than a 500 error.
- [ ] Delete blocks with `CREDENTIAL_IN_USE` for current draft/published node references and non-terminal execution references, identifies affected workflow/execution references without secrets, and permits an unreferenced credential to be deleted.
- [ ] The UI makes Rename, Rotate secret, and Delete discoverable from a credential card; rotate/delete have explicit, accessible warnings; errors are actionable and input remains intact.
- [ ] A renamed or rotated credential remains selected by existing node configuration because its ID does not change.
- [ ] Google OAuth credentials stay on the OAuth reconnect path rather than showing their secret in the manual rotation form.
- [ ] Tests cover service/controller behavior, redaction/reference safety, and a mocked Playwright credential lifecycle. `npm run verify` passes.

## Required evidence

- Tests to add or update: credential-service tests for owner authorization, update encryption/identity, unique-label conflict mapping, audit safety, deletion reference cases; controller/API tests when practical; Playwright mocked UI coverage for rename, rotation, blocked delete, and successful delete.
- Commands to run: `npm run codegraph:generate` when imports change; targeted credential tests; `npx playwright test` for the focused spec; `npm run harness:report -- .agent/reports/2026-10-25-credential-lifecycle.md`; `npm run verify`.
- UI/manual proof: describe the form states, confirmation/blocker behavior, and proof that no secret appears in browser list/API response.

## Safety boundaries

- Read `AGENTS.md`, `docs/06-loop-engineering.md`, `docs/10-agent-harness.md`, and `docs/11-code-graph.md` before editing.
- Do not use, print, commit, or request real provider credentials. Test fixtures must use obvious fake values only.
- Do not deploy, publish, merge, alter CI secrets, or make external provider calls.
- Preserve `apps/web/next-env.d.ts` exactly as received; do not stage it.
- Update `docs/11-code-graph.json` with `npm run codegraph:generate` when source dependencies change.
- Produce focused commit(s) and a report using `.agent/report-template.md`.
