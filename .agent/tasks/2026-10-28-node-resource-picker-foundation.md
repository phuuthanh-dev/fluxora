# Node resource picker foundation

## Identity

- Task ID: `2026-10-28-node-resource-picker-foundation`
- Base commit: `41764e550a8530ff0381f2897a4b586e810a3f66`
- Working branch: `main`
- Implementer/reviewer: `Codex and human owner`

## Target slice IDs

- `GH-UX-1`

## Outcome

Create a provider-agnostic configuration-field contract that prevents
avoidable free-text configuration. GitHub repository fields use a secure
server-side resource picker, static enum fields render as selects, and the
same metadata path is ready for future Google, Telegram, Discord, Steam, and
other provider resources.

## In scope

- Add declarative `select` and `resource` field types to the node catalog.
- Add a reusable frontend resource-picker primitive with loading, empty,
  unavailable-selection, error, search, and credential-dependent states.
- Add an owner-scoped backend endpoint that reads a GitHub connector token
  server-side and returns only safe repository metadata.
- Use the GitHub repository picker for GitHub actions and an optional
  repository filter on GitHub webhook triggers.
- Add a repository filter check to verified GitHub webhook delivery when the
  workflow config contains one.
- Convert obvious static enum fields for GitHub merge method, HTTP method,
  Google Drive operation, and Google Sheets operation to selects.
- Add focused API/web tests and update product/architecture/loop evidence.

## Explicitly out of scope

- Real provider credentials, real GitHub API smoke tests, or external webhook
  registration.
- GitHub App installation/OAuth resource sync, pagination beyond the bounded
  first page, repository mutation, label/issue remote pickers, or automatic
  webhook registration.
- Changing credential storage to one credential per repository. A credential
  remains an auth connection; repository and webhook scope remain workflow
  metadata.
- Deployment, database migrations, CI secret changes, or merging.

## Acceptance criteria

- [x] The inspector supports reusable static selects and resource pickers
  without provider-specific component duplication.
- [x] GitHub actions no longer require manually typing repository names when a
  compatible credential can list repositories.
- [x] GitHub repository listing never returns token/secret values and is
  owner/workspace scoped.
- [x] GitHub webhook triggers can optionally scope delivery to a selected
  repository and reject mismatched repository payloads before queueing.
- [x] Existing graphs without a repository filter remain importable and
  executable for backwards compatibility.
- [x] No real provider call occurs in tests; `npm run verify` passes.

## Required evidence

- `apps/api/src/credentials/github-resource.service.test.ts`
- `apps/web/src/features/workflow/workflow-graph-schema.test.ts`
- `npm run agent:task:check -- .agent/tasks/2026-10-28-node-resource-picker-foundation.md`
- `npm run codegraph:check`
- `npm run verify`

## Safety boundaries

- Read `AGENTS.md`, `docs/06-loop-engineering.md`, `docs/10-agent-harness.md`,
  and `docs/11-code-graph.md` before editing.
- Never read, print, commit, or request real provider credentials.
- Do not call a provider during tests, deployment, or CI.
- Do not deploy, publish, merge, or alter CI secrets.
