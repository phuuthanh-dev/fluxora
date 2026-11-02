# Preserve keyboard focus in the app library

## Identity

- Task ID: `2026-11-02-node-library-keyboard-focus`
- Base commit: `151d89911775ae5752c27ec445c194847bbf462e`
- Working branch: `develop`
- Implementer: Codex
- Reviewer: Codex and CI

## Target slice IDs

- `APP-EXPANSION-1`
- `EDITOR-QUALIFICATION-1`

## Outcome

Keyboard users keep focus when opening a planned app, and arrow navigation applies only to app/filter buttons rather than category headings.

## In scope

- Shared node-library focus management and the existing keyboard-only browser journey.
- Record exact verification and release status.

## Explicitly out of scope

- New connectors, catalog metadata, styling, credentials, external provider calls and migrations.

## Acceptance criteria

- [ ] Opening an app with only planned operations focuses its first focusable planned operation; Escape returns to its app button.
- [ ] Arrow keys on category toggle buttons do not jump into the app collection; arrow navigation between app buttons still works.
- [ ] The existing keyboard journey and final full verification pass in isolated services.

## Safety boundaries

- No provider calls or real credentials. Keep local web/API running and use isolated test services.
