# Task contract — dashboard regression UX

## Identity

- Task ID: `2026-10-25-dashboard-regression`
- Base commit: `f513c28`
- Working branch: `codex/dashboard-regression`
- Implementer: Antigravity using a fast implementation model
- Reviewer: Codex

## Outcome

An authenticated owner can distinguish dashboard/editor loading from a runtime outage, see a failed workflow-template creation clearly, retry it without a page reload, and switch workspaces without stale workflow content.

## In scope

- Dashboard runtime-status loading, ready, degraded, and unreachable states with concise, accessible status copy.
- Workspace switch loading/error/retry behavior and prevention of stale workflow cards while the selected workspace changes.
- Workflow-template creation failure state that preserves the form, re-enables the action, and lets the owner retry.
- Equivalent loading/error/retry feedback in the editor workflow library where it shares the same workflow-creation path.
- Focused Playwright coverage for runtime API failure, template-creation failure/retry, and workspace switching.
- Narrow component/unit tests when they make state logic easier to prove.

## Explicitly out of scope

- Provider integrations, credential handling, real external HTTP calls, deployment, migrations, authentication redesign, or changes to the workflow execution engine.
- Broad visual redesign, mobile redesign, new dashboard data sources, or new workspace/team permissions.
- Changing API response shapes unless a concrete UI bug cannot be solved client-side; document any such proposal instead of implementing it.

## Acceptance criteria

- [ ] The runtime panel says it is checking while readiness is loading; it does not initially present an outage as fact.
- [ ] A readiness response with `degraded` and a network/API failure are visibly distinct and accessible.
- [ ] A failed Steam-template request leaves the owner on the dashboard, shows an actionable error, restores the button, and permits a successful retry.
- [ ] Changing workspace never briefly displays workflows from the previous workspace as though they belong to the new one.
- [ ] The editor workflow library provides an understandable loading/error/retry path for workflow creation/loading.
- [ ] Playwright proves the above without real provider credentials or external provider calls.
- [ ] `npm run verify` passes and the code graph is regenerated if source imports change.

## Required evidence

- Tests to add or update: targeted Playwright tests for dashboard state transitions; component tests only where state logic is extracted.
- Commands to run: `npm run codegraph:generate` when needed, targeted test command, then `npm run verify`.
- UI/manual proof: describe the four runtime states and one failed-then-retried template creation in the handoff report.

## Safety boundaries

- Read `AGENTS.md`, `docs/06-loop-engineering.md`, `docs/10-agent-harness.md`, and `docs/11-code-graph.md` before editing.
- Do not use, print, commit, or request real provider credentials.
- Do not deploy, publish, merge, alter CI secrets, or make external provider calls.
- Update `docs/11-code-graph.json` with `npm run codegraph:generate` when source dependencies change.
- Produce a focused commit and a report using `.agent/report-template.md`.
