# Task contract

## Identity

- Task ID: `2026-10-27-node-library-app-operations`
- Base commit: `2333cdf7a55cce7475301b1b2576e32211558768`
- Working branch: `codex/node-library-app-operations`
- Implementer: `Codex`
- Reviewer: `Codex and human owner`

## Outcome

A user can discover existing Fluxora steps through Core nodes or App → Operation,
search the whole catalog, reuse recent/favorite operations, and add a step without
changing persisted node types or runtime behavior.

## In scope

- Product, architecture, roadmap, implementation, and loop documentation.
- Source-owned App/Operation metadata layered over existing node definitions.
- Two-level Node Library with search, discovery filters, recent, and favorites.
- Canvas wording and template use-case tags.
- Unit and Playwright regression coverage.

## Explicitly out of scope

- New runtime connectors or provider calls.
- GitHub/GitLab/Gitea/Sentry/Portainer/SSH executors.
- Credential schema changes, database-backed preferences, marketplace, or SDK.
- Deployment, CI-secret changes, or real credentials.

## Acceptance criteria

- [x] Existing node type identifiers and workflow JSON stay compatible.
- [x] Core nodes and app operations are discoverable without a long flat app list.
- [x] Search matches app and operation metadata and can reveal planned operations.
- [x] Recent and favorites persist locally and remain keyboard accessible.
- [x] Canvas nodes distinguish app and operation without changing execution data.
- [x] System templates expose and render use-case tags.
- [x] Unit, Playwright, code-graph, and full repository verification pass.

## Required evidence

- Tests to add or update: node catalog unit coverage, system-template contract,
  dashboard/editor Playwright regression.
- Commands to run: targeted workspace tests, `npm run codegraph:generate`,
  `npm run verify`.
- UI/manual proof: Add Node Core/App navigation, favorite/recent state, template
  tags, and both themes.

## Safety boundaries

- Read `AGENTS.md`, `docs/06-loop-engineering.md`, `docs/10-agent-harness.md`, and
  `docs/11-code-graph.md` before editing.
- Do not use, print, commit, or request real provider credentials.
- Do not deploy, publish, merge, alter CI secrets, or make external provider calls.
- Update `docs/11-code-graph.json` with `npm run codegraph:generate` when source
  dependencies change.
- Produce a focused commit only after the full quality gate passes.
