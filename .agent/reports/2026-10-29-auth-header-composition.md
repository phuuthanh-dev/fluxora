# Auth header correction

## Outcome

- Status: complete (local implementation; owner visual acceptance pending).
- Restored the original auth body and replaced the rejected split header with
  one theme-aware surface, compact support link and circular theme control.

## Commit and scope

- Base: `41ae79e446f2fb91f3b0afd26eb2bd14385ee7f3`.
- Implementation: this local change on `codex/auth-header-composition`, then
  fast-forward into local `develop`.
- Scope respected: yes; diff against `ddaa9e9` affects auth header CSS/markup
  only. No auth behavior, provider, database or deployment changes.

## Acceptance criteria

| Criterion | Evidence | Status |
|---|---|---|
| One continuous header in light/dark | 12 rendered screenshots inspected | pass |
| Original body/form/breakpoints | Diff against `ddaa9e9` | pass |
| Operable auth and responsive header | Existing auth-polish and ui-core coverage | pass |
| No premature release | PR #45 remains draft; local correction only | pass |

## Validation receipts

| Command/review | Result | Evidence |
|---|---|---|
| agent:task:check | pass | L13.1 explicit owner reopen |
| Focused auth E2E | pass | 4 tests; `/tmp/fluxora-auth-header-only-focused.log` |
| npm run verify | pass | 213 API, 23 web, 82 E2E; `/tmp/fluxora-auth-header-only-verify.log` |
| git diff --check | pass | No whitespace errors |
| Visual review | pass for layout/legibility | Login/register × light/dark × 1440/768/390; `../previews/auth-header-only-2026-10-29/` |

## Files changed

- `apps/web/src/app/product-shell.css`: header-only styling; remove split gradient.
- `apps/web/src/features/auth/login-form.tsx`: header help icon and control group.
- `docs/25-ui-core-unification.md`, `docs/19-agent-state.md`: owner correction and evidence.
- Matching task contract and this report.

## Risks and follow-up

Owner review is still required before release. Functional passes do not imply
visual approval. The original dark introduction/light form composition is
intentionally preserved; do not reintroduce split-header or inset-panel designs.
No push, merge to main, deployment or real provider qualification was performed.

## Owner follow-up: separate the brand bar from the light form

- Base for follow-up: `8e25593`. The owner identified the pale bar visually
  merging with the light right column. Only `.auth-navigation` now aliases
  semantic colors to existing dark marketing tokens, including hover/focus.
  The full-width header stays dark; the form still follows the selected theme.
- Existing responsive matrix passed (1 focused test, 12 screenshots); desktop
  login/light, register/dark and mobile login/light screenshots reviewed at
  `../previews/auth-brand-header-2026-10-29/`.
- One-off rendered contrast check passed in both themes: support 9.28:1,
  theme icon 8.69:1, support hover 16.04:1. Shift+Tab shows the focus ring.
  Initial programmatic-focus probe was replaced with keyboard navigation:
  pointer-origin focus need not match `:focus-visible`.
- `npm run verify` passed again: 213 API, 23 web, 82 E2E, plus build and harness.
  Receipt: `/tmp/fluxora-auth-brand-header-verify.log`.
- Local develop integration only. PR #45 remains draft; owner visual acceptance
  and release are still pending.

## Release handoff

- The owner subsequently requested merge. Refreshed remote state shows PR #45
  merged the earlier `41ae79e` revision; it does not contain corrections
  `8e25593` and `4d2156c`.
- Release the corrections through the next `develop` to `main` PR after its
  checks pass. Earlier local-only/draft notes above describe implementation
  time, not current authorization or remote state.
