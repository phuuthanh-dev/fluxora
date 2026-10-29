# Task contract

## Identity
- Task ID: `2026-10-29-product-experience`
- Base commit: `bff788782f6be8034629595abfc522f446eda6ac`
- Working branch: `codex/product-experience-polish`
- Implementer/reviewer: Codex

## Outcome
Improve the authenticated workspace UI after the public-site release, using the existing landing-derived design system.

## Target slice IDs
- `L13.1`

## Reopen justification
Owner explicitly requested a further UI update across dashboard, editor, connections, dialogs and modals on 2026-10-29. The current screenshot audit shows workflow cards below the create form, a dominant raw-JSON connection form above the saved list, small metadata, and an account menu visible in a screenshot after Escape. This is a new refinement and regression investigation, not reimplementation of completed UI-CORE-1.

## In scope
Workflow-first dashboard, connection list/search and separate create interaction, guided secret fields with advanced JSON, shared menu/dialog behavior, readable editor/shell composition, tests and documentation.

## Explicitly out of scope
Runner, schema, database, provider access, new integrations, dependency replacement, landing ribbon, deployment configuration.

## Acceptance criteria
- [x] Existing workflows and connections are easier to find and manage; creation remains obvious.
- [x] New secrets have labelled masked fields and an explicit advanced JSON path, without exposing stored secrets.
- [x] Menu dismissal, focus, dialog spacing and editor readability work in both themes and supported widths.
- [x] Focused regressions, visual review and npm run verify pass; local task commits integrate into develop only.

## Required evidence
Synthetic local E2E, theme/responsive screenshots, credential lifecycle regressions, full gate, report.

## Safety boundaries
Owner authorized public release. Product changes use local synthetic accounts only; no live provider calls, production data edits or infrastructure changes. Task branch stays local; only develop may be pushed. Preserve credential payloads and server validation.
