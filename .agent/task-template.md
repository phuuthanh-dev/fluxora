# Task contract

## Identity

- Task ID: `YYYY-MM-DD-short-name`
- Base commit: `<full SHA>`
- Working branch: `codex/<short-name>` or agent-specific branch
- Implementer: `<agent and model>`
- Reviewer: `<agent or person>`

## Outcome

State one user-visible vertical slice. It must be small enough to review in one pull request.

## In scope

- Describe the allowed implementation surface.

## Explicitly out of scope

- Describe what must not change.

## Acceptance criteria

- [ ] State one independently verifiable outcome.

## Required evidence

- Tests to add or update:
- Commands to run:
- UI/manual proof, if relevant:

## Safety boundaries

- Read `AGENTS.md`, `docs/06-loop-engineering.md`, `docs/10-agent-harness.md`, and `docs/11-code-graph.md` before editing.
- Do not use, print, commit, or request real provider credentials.
- Do not deploy, publish, merge, alter CI secrets, or make external provider calls.
- Update `docs/11-code-graph.json` with `npm run codegraph:generate` when source dependencies change.
- Produce a commit and a report using `.agent/report-template.md`.
