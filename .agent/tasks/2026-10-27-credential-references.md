# Task contract

## Identity

- Task ID: `2026-10-27-credential-references`
- Base commit: `ab3d00e`
- Working branch: `codex/production-release-candidate-v1`
- Implementer: `Codex`
- Reviewer: `Codex`

## Outcome

Show safe, workspace-scoped credential usage references before rename, secret rotation, and deletion.

## Target slice IDs

- `UX-1`

## In scope

- Add a read-only owner-protected references endpoint for one credential.
- Return current draft/published workflow references and active execution references without graph payloads or secret values.
- Reuse the reference data for the existing delete conflict response.
- Load and display references in the credential manager action panels.
- Add service and browser regression coverage.

## Explicitly out of scope

- Credential schema changes or secret decryption in the browser.
- Historical execution search, workflow editing, or provider calls.
- Changes to rename/rotation/delete authorization or safety guards.

## Acceptance criteria

- [ ] Starting rename, rotation, or deletion shows the credential's current workflow and active execution references, with an explicit empty state when unused.
- [ ] The API is owner-scoped and never returns graph data, encrypted data, or secret values.
- [ ] Existing delete conflict behavior remains compatible and the quality gate passes.

## Required evidence

- Tests to add or update: credential service reference tests and credential lifecycle Playwright coverage.
- Commands to run: `npm run agent:task:check -- .agent/tasks/2026-10-27-credential-references.md`, `npm run verify`.
- UI/manual proof, if relevant: credential action panels show safe usage summary in the connection center.

## Safety boundaries

- Read `AGENTS.md`, `docs/06-loop-engineering.md`, `docs/10-agent-harness.md`, and `docs/11-code-graph.md` before editing.
- Do not use, print, commit, or request real provider credentials.
- Do not deploy, publish, merge, alter CI secrets, or make external provider calls.
- Update `docs/11-code-graph.json` with `npm run codegraph:generate` when source dependencies change.
- Produce a commit and a report using `.agent/report-template.md`.
