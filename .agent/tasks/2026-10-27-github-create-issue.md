# Task contract

## Identity

- Task ID: `2026-10-27-github-create-issue`
- Base commit: `3179f326e9f2e27c74df8c5e0ba37abbc78982a7`
- Working branch: `codex/github-connector-p2-1a`
- Implementer: `Codex`
- Reviewer: `Codex`

## Outcome

Deliver the first production-backed GitHub connector slice: a separate encrypted GitHub credential and a `GitHub → Create issue` action that supports deterministic mock runs and guarded live execution.

## Target slice IDs

- `P2-1`

## In scope

- Add a workspace-owned `GITHUB` credential provider with the existing encrypted vault and credential-management UI.
- Make the existing GitHub operation discoverable in the Node Library with credential, repository, title, body, and labels fields.
- Add server-side live-readiness for the GitHub credential.
- Implement mock and live GitHub Create Issue execution with official API URL validation, timeout, safe error classification, and token redaction.
- Add focused unit coverage for mock execution, request formation, credential provider matching, validation, and retry classification.
- Update the product/architecture/loop state documentation and produce a factual report.

## Explicitly out of scope

- GitHub login OAuth token reuse; login identities remain separate and their tokens are never used as connector credentials.
- GitHub OAuth/GitHub App installation flow.
- Webhook triggers, pull-request triggers, comments, labels, merge, releases, or other GitHub operations.
- Real GitHub calls or real credentials in tests, CI, or browser automation.

## Acceptance criteria

- [x] A `GITHUB` credential can be created and selected without exposing its token.
- [x] `GitHub → Create issue` is available in the editor and declares its GitHub credential requirement.
- [x] Mock mode returns a deterministic issue result without invoking `fetch`.
- [x] Live mode calls only the GitHub API host, sends the token server-side, returns a normalized issue result, and never persists the token.
- [x] Invalid repository/configuration, authentication/permission errors, rate limits, server errors, timeout, and network failures map to safe execution errors.
- [x] Focused tests and `npm run verify` pass with no provider calls.

## Required evidence

- Tests to add or update: GitHub executor tests, live-readiness test, web catalog/credential contract coverage as applicable.
- Commands to run: `npm run agent:task:check -- .agent/tasks/2026-10-27-github-create-issue.md`, focused tests, `npm run verify`, `npm run harness:check`, `git diff --check`.
- UI/manual proof, if relevant: inspect the GitHub credential preset and Create Issue fields locally; do not save real provider credentials.

## Safety boundaries

- Read `AGENTS.md`, `docs/06-loop-engineering.md`, `docs/10-agent-harness.md`, and `docs/11-code-graph.md` before editing.
- Do not use, print, commit, or request real provider credentials.
- Do not deploy, publish, merge, alter CI secrets, or make external provider calls.
- Update `docs/11-code-graph.json` with `npm run codegraph:generate` when source dependencies change.
- Produce a commit and a report using `.agent/report-template.md`.
