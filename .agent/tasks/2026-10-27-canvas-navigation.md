# Task contract

## Identity

- Task ID: `2026-10-27-canvas-navigation`
- Base commit: `54dc235`
- Working branch: `codex/production-release-candidate-v1`
- Implementer: `Codex`
- Reviewer: `Codex`

## Outcome

Give dense workflow canvases an explicit, keyboard-accessible navigation rail and a collapsible minimap without changing graph semantics.

## Target slice IDs

- `UX-2`

## In scope

- Add shared-icon-button based canvas navigation controls for fit, zoom, and selected-node focus.
- Add an accessible show/hide minimap control with a visible state.
- Preserve React Flow node/edge behavior, selection, connection drawing, keyboard navigation, theme, zoom, and reduced-motion behavior.
- Add focused browser coverage and update the loop handoff documents.

## Explicitly out of scope

- Workflow graph model, node positions, edge semantics, auto-layout algorithm, or execution behavior.
- Mobile-specific canvas redesign or provider integrations.
- Replacing React Flow controls or adding a second pan/zoom library.

## Acceptance criteria

- [ ] Canvas exposes labeled fit, zoom in, zoom out, center-selection, and minimap toggle actions.
- [ ] Center-selection is disabled until a node is selected; fit/zoom controls remain usable with no selection.
- [ ] Minimap can be hidden and restored without changing canvas layout or graph state.
- [ ] Controls meet existing keyboard/theme/reduced-motion regressions and full quality gate passes.

## Required evidence

- Tests to add or update: editor onboarding Playwright navigation coverage.
- Commands to run: `npm run agent:task:check -- .agent/tasks/2026-10-27-canvas-navigation.md`, `npm run verify`.
- UI/manual proof, if relevant: visible navigation rail and minimap toggle in the editor at desktop widths.

## Safety boundaries

- Read `AGENTS.md`, `docs/06-loop-engineering.md`, `docs/10-agent-harness.md`, and `docs/11-code-graph.md` before editing.
- Do not use, print, commit, or request real provider credentials.
- Do not deploy, publish, merge, alter CI secrets, or make external provider calls.
- Update `docs/11-code-graph.json` with `npm run codegraph:generate` when source dependencies change.
- Produce a commit and a report using `.agent/report-template.md`.
