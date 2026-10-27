# GitHub Merge Pull Request

## Identity

- Task ID: `2026-10-28-github-merge-pull-request`
- Base commit: `31d8b00`
- Working branch: `codex/github-connector-p2-1a`
- Implementer: `Codex`
- Reviewer: `Codex review + owner approval`

## Outcome

Add a separately discoverable `GitHub → Merge pull request` action using the
workspace-owned GitHub connector credential and the shared execution safety
contract.

## Target slice IDs

- `P2-1`

The completed implementation will be recorded as ledger evidence L11.10 after
the quality gate passes.

## In scope

- Add a stable contract node type and App → Operation catalog entry.
- Reuse the encrypted GitHub connector credential and readiness mapping; never
  reuse GitHub account-login OAuth state.
- Validate repository, positive pull-request number, and merge method.
- Support deterministic mock execution and guarded live `api.github.com`
  execution with normalized merge output.
- Preserve safe timeout, retryability, and token-redaction behavior.
- Add focused API/web tests and update repository documentation and loop ledger.

## Explicitly out of scope

- GitHub account sign-in changes.
- Real provider smoke tests or real credentials.
- GitHub triggers, pull-request creation/update operations, deployment, or
  production configuration.

## Acceptance criteria

- [x] The Merge Pull Request node is discoverable with credential, repository,
  pull-request number, and merge-method fields.
- [x] Mock execution is deterministic and makes no provider request.
- [x] Live execution uses only the workspace GitHub connector token, the fixed
  merge route, a bounded timeout, and normalized output.
- [x] Invalid input, provider HTTP errors, and retry classification are tested.
- [x] `npm run verify` passes without real credentials or provider calls.

## Required evidence

- Tests to add or update: `apps/api/src/execution/github.test.ts`,
  `apps/api/src/execution/live-readiness.test.ts`,
  `apps/web/src/features/workflow/workflow-graph-schema.test.ts`.
- Commands to run: `npm run agent:task:check -- .agent/tasks/2026-10-28-github-merge-pull-request.md`,
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
