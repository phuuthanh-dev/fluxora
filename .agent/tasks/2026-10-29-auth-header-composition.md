# Task contract

## Identity
- Task ID: `2026-10-29-auth-header-composition`
- Base commit: `41ae79e446f2fb91f3b0afd26eb2bd14385ee7f3`
- Working branch: `codex/auth-header-composition` (local only)
- Implementer/reviewer: Codex

## Outcome
Restore the login/register body to commit ddaa9e9 (before the split header), then style only the authentication header as one continuous dark brand surface above the theme-aware form.

## Target slice IDs
- `L13.1`

## Reopen justification
The owner's 2026-10-29 screenshot explicitly rejects commit 41ae79e: its 50/50 gradient splits a single header into black and white. The subsequent inset-panel experiment was also rejected. The latest instruction is to restore the earlier body layout and style the header only. PR #45 is draft and has not merged. Passing functional tests did not establish visual acceptance.

Follow-up after `8e25593`: the owner identifies the pale header blending into
the pale right column. Preserve the restored body and use the landing's dark
brand palette across the entire header, including readable hover/focus states.

## In scope
Restore the original auth body CSS; refine only auth-navigation CSS and header markup, screenshot review, existing auth/theme checks and durable design notes.

## Explicitly out of scope
Authentication behavior, providers, database, app-shell and landing styling, new motion, production release.

## Acceptance criteria
- [x] Header is one continuous surface in both themes, with readable brand, support and theme control.
- [x] Auth page grid, introduction, form and responsive breakpoints match ddaa9e9; only header styling differs.
- [x] Actual screenshots reviewed for both routes/themes on desktop, tablet and mobile; existing auth checks and full verify pass.
- [x] Local task commit integrated into develop; no merge or deployment before owner reviews the corrected visual.
- [x] Follow-up: dark brand header stays distinct from the light form; review both routes/themes and rerun the quality gate before local integration.

## Required evidence
Reuse e2e/auth-polish.spec.ts and ui-core auth coverage. Review their generated screenshots rather than only reporting pass counts. Run npm run verify and git diff --check. No additional implementation-mirroring test is needed for this CSS correction.

## Safety boundaries
No real credentials, provider calls, schema changes, or production mutation. Keep PR #45 unmerged. Reuse existing tokens, components and local font.
