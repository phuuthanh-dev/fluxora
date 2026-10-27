# Task contract

## Identity

- Task ID: `2026-10-27-remove-duplicate-canvas-controls`
- Base commit: `606000eb79ba3504c84c0c1d03bc1c864414d524`
- Working branch: `codex/production-release-candidate-v1`
- Implementer: `Codex`
- Reviewer: `Codex`

## Outcome

Keep one clear canvas-navigation surface in the editor by removing the duplicate React Flow zoom controls while preserving the custom Canvas rail.

## Target slice IDs

- Reopen `L11.5` — Dense-canvas navigation and minimap.

## Reopen justification

The screenshots and current implementation show two separate `+ / −` control groups: the custom `CANVAS` rail and React Flow's default `.react-flow__controls`. This is a concrete UX regression/changed requirement because the same zoom actions are exposed twice and make the editor hierarchy ambiguous.

## In scope

- Remove the default React Flow `Controls` component and unused import from the workflow editor.
- Keep the custom Canvas rail controls for fit, zoom, selected-node centering, and minimap visibility.
- Add a browser regression assertion that the default React Flow controls are absent.
- Correct stale UX2 evidence metadata to reference the amended base commit where necessary.

## Explicitly out of scope

- No graph model, node/edge behavior, zoom semantics, or minimap implementation changes.
- No new editor toolbar actions, provider integrations, deployment, merge, or real provider calls.

## Acceptance criteria

- [ ] The editor renders only the custom Canvas navigation rail for fit/zoom navigation; `.react-flow__controls` is absent.
- [ ] Existing Canvas rail and minimap interactions remain covered and passing.
- [ ] No unrelated editor action or layout behavior changes.

## Required evidence

- Tests to add or update: `e2e/editor-onboarding.spec.ts` assertion for absent default controls.
- Commands to run: `npm run agent:task:check -- .agent/tasks/2026-10-27-remove-duplicate-canvas-controls.md`, focused Playwright editor test, `npm run verify`, `npm run harness:check`, `git diff --check`.
- UI/manual proof, if relevant: inspect the editor and confirm only one visible `+ / −` group remains.

## Safety boundaries

- Read `AGENTS.md`, `docs/06-loop-engineering.md`, `docs/10-agent-harness.md`, and `docs/11-code-graph.md` before editing.
- Do not use, print, commit, or request real provider credentials.
- Do not deploy, publish, merge, alter CI secrets, or make external provider calls.
- Update `docs/11-code-graph.json` with `npm run codegraph:generate` when source dependencies change.
- Produce a commit and a report using `.agent/report-template.md`.
