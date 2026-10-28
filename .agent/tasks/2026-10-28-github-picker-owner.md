# GitHub repository owner filter

## Identity

- Task ID: `2026-10-28-github-picker-owner`
- Base commit: `2cd363b`
- Working branch: `codex/connector-config-audit`
- Implementer/reviewer: `Codex and human owner`

## Outcome

Make GitHub repository discovery explicit about token visibility and provide an
owner filter without hard-coding the user's account or organization.

## Target slice IDs

- `GH-PICKER-OWNER-1`

## In scope

- Return safe owner names from the existing owner-scoped repository proxy.
- Support a validated, case-insensitive owner filter in the API.
- Add a repository-owner selector to the GitHub resource picker with loading,
  current-value, and reset behavior.
- Preserve manual/expression fallback, selected repository values, pagination,
  workspace ownership, and credential secrecy.
- Add API and browser regression coverage and document classic-token behavior.

## Explicitly out of scope

- Assuming or enforcing `ithelpdesk` (or any other account) as a global owner.
- Changing GitHub credential permissions, creating an allowlist credential
  schema, provider calls outside the existing read proxy, or webhook lifecycle.
- Live GitHub requests, deployment, migrations, or external writes.

## Acceptance criteria

- [x] Repository proxy returns only safe owner metadata and filters correctly.
- [x] Picker exposes owner selection without losing selected repository data.
- [x] Invalid owner input is rejected at the API boundary.
- [x] Focused tests, task-state check, and full quality gate pass.

## Required evidence

- `apps/api/src/credentials/github-resource.service.test.ts`
- `apps/web/src/features/workflow/resource-picker.tsx`
- `npm run agent:task:check -- .agent/tasks/2026-10-28-github-picker-owner.md`
- `npm run verify`

## Safety boundaries

- Do not read, print, commit, or request real provider credentials.
- Do not call GitHub during tests, deploy, merge, or alter CI secrets.
