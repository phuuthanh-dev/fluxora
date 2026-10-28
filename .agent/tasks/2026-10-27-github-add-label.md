# GitHub Add Label

## Identity

- Task ID: `2026-10-27-github-add-label`
- Base commit: `a0f70b0`
- Working branch: `codex/github-connector-p2-1a`
- Implementer: `Codex`
- Reviewer: `Codex review + owner approval`

## Outcome

Add a separately discoverable `GitHub → Add label` action that uses the
workspace-owned GitHub connector credential and the shared execution safety
contract.

## Target slice IDs

- `P2-1`

The completed implementation will be recorded as ledger evidence L11.8 after
the quality gate passes.

## In scope

- Add a stable contract node type and App → Operation catalog entry.
- Reuse the existing encrypted GitHub connector credential and live-readiness
  mapping; do not reuse GitHub account-login OAuth state.
- Validate repository, positive issue number, and printable label input.
- Support deterministic mock execution and guarded live `api.github.com`
  execution with normalized output.
- Preserve safe timeout, retryability, and token-redaction behavior.
- Add focused API/web tests and update the repository documentation and loop
  ledger.

## Explicitly out of scope

- GitHub account sign-in changes.
- Real provider smoke tests or real credentials.
- Pull-request operations, issue creation changes, triggers, deployment, or
  production configuration.

## Acceptance criteria

- [x] The Add Label node is discoverable and has stable reusable inspector
  fields for credential, repository, issue number, and label.
- [x] Mock execution is deterministic and makes no provider request.
- [x] Live execution uses only the workspace GitHub connector token, the fixed
  issue-labels route, a bounded timeout, and normalized output.
- [x] Invalid input, provider HTTP errors, and retry classification are tested.
- [x] `npm run verify` passes without real credentials or provider calls.

## Required evidence

- Tests to add or update: `apps/api/src/execution/github.test.ts`,
  `apps/api/src/execution/live-readiness.test.ts`,
  `apps/web/src/features/workflow/workflow-graph-schema.test.ts`.
- Commands to run: `npm run agent:task:check -- .agent/tasks/2026-10-27-github-add-label.md`,
  `npm run verify`.
- UI/manual proof: catalog and Inspector metadata are covered by web contract
  tests; no live provider call is permitted in this slice.

## Safety boundaries

- Read `AGENTS.md`, `docs/06-loop-engineering.md`, `docs/10-agent-harness.md`,
  and `docs/11-code-graph.md` before editing.
- Do not use, print, commit, or request real provider credentials.
- Do not deploy, publish, merge, alter CI secrets, or make external provider
  calls.
- Update `docs/11-code-graph.json` with `npm run codegraph:generate` when source
  dependencies change.
- Produce a commit and a report using `.agent/report-template.md`.
