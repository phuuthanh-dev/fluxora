# Task contract

## Identity

- Task ID: `2026-10-27-accessibility-hardening-v1`
- Base commit: `42de1cb8d6de89c8382b7bb39bfc74de2a9a8577`
- Working branch: `codex/accessibility-hardening-v1`
- Implementer: `Codex`
- Reviewer: `Codex and human owner`

## Outcome

Fluxora's authenticated editor remains usable with keyboard-only input, modal
focus never escapes or disappears, and the interface remains readable and
operable under browser zoom, reduced motion, and both product themes.

## Exactly three vertical slices

1. Node Library and editor command-bar keyboard navigation.
2. Shared dialog, drawer, menu, and overlay focus lifecycle.
3. Browser zoom, reduced-motion, and light/dark accessibility regression.

## In scope

- Shared frontend primitives and focused editor/dashboard integrations.
- Escape hierarchy, arrow-key menu/filter navigation, focus entry and return.
- Focus trap for modal dialogs and the responsive inspector drawer.
- Playwright coverage for keyboard-only paths, 125%/150% zoom-equivalent
  layouts, reduced-motion state, and both themes.
- Design-system, implementation-plan, loop, code-graph, and handoff docs.

## Explicitly out of scope

- Provider credentials, provider API calls, execution semantics, and database
  changes.
- Mobile-first redesign, canvas edge creation entirely by keyboard, or a new
  command-palette framework.
- Deployment, CI secret changes, publication, or production smoke tests.

## Acceptance criteria

### Slice 1 — keyboard navigation

- [x] `/` opens the Node Library and focuses search without firing in a form.
- [x] Escape clears search, returns from app detail, then collapses the library
  with deterministic focus return to `Add node`.
- [x] Filter chips and app grids support arrow/Home/End navigation.
- [x] Shared menus support arrow/Home/End navigation and Escape focus return.
- [x] Planned operations remain discoverable and expose their unavailable state.

### Slice 2 — focus lifecycle

- [x] Shared modal dialogs focus a meaningful first control, trap Tab/Shift+Tab,
  close on Escape, and restore focus to their trigger.
- [x] Non-modal editor panels focus on entry, close on Escape, and restore focus
  without trapping the rest of the editor.
- [x] The responsive node inspector reuses the same focus contract.
- [x] Account, workflow, and editor menus close on outside interaction and return
  focus after keyboard dismissal.

### Slice 3 — adaptive accessibility

- [x] Core editor actions remain visible and usable at 125% and 150%
  zoom-equivalent desktop layouts.
- [x] Reduced-motion mode removes non-essential animation and transitions.
- [x] Keyboard focus and readable contrast are covered in light and dark themes.
- [x] Focused tests, code-graph check, and `npm run verify` pass.

## Required evidence

- Focused Playwright specs for editor onboarding/accessibility and dashboard
  dialog/menu behavior.
- Web typecheck and existing editor/dashboard regression suites.
- `npm run codegraph:generate` after source import changes.
- `npm run verify` and a validated report based on `.agent/report-template.md`.

## Safety boundaries

- Use deterministic local data and mocked providers only.
- Never read, print, modify, or commit `.env` values or provider secrets.
- Do not deploy, publish, push, merge, or invoke external provider APIs.
- Keep each slice reviewable and commit only after its focused checks pass.
