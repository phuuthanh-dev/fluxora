# Global design system

**Status:** v1 active, Relay-inspired
**Decision date:** 2026-10-25
**Owner:** Workflow Automation product

This document is the source of truth for the visual foundation shared by the
dashboard, editor, authentication screens, credential surfaces, execution
views, and future routes.

## Intent

The product is moving to a Relay-inspired identity before the purchased Relay
template is available. Public Relay references establish a near-black and
acid-lime direction, but they do not expose the purchased template's private
token manifest. These values are therefore an intentional product adaptation,
not a claim of pixel-perfect or proprietary Relay tokens.

The application keeps a light workflow canvas because graph readability and
long-running configuration work are more important than copying a marketing
hero. The shell, command surfaces, drawers, dialogs, and runtime overlays use
the near-black foundation.

Light mode is the default product presentation. Dark mode keeps the same
Relay-inspired shell and lime hierarchy but moves the dashboard, canvas,
inspector, forms, cards, and graph controls onto dark reading surfaces. The
choice is stored under `workflow-automation-theme` and is applied by the
shared client toggle on mount. The default light presentation keeps the first
render stable, while subsequent visits restore the saved choice. The toggle is
available on auth, dashboard, and editor surfaces.

## Token source

The implementation source is:

- `apps/web/src/app/design-system.css` — global tokens and reusable recipes;
- `apps/web/src/app/globals.css` — legacy class migration and route-level
  composition;
- `apps/web/src/features/workflow/node-icon.tsx` — provider and node icon
  identity.

New CSS must consume tokens from `design-system.css`. A raw color is allowed
only when it is a provider brand color or a clearly documented semantic state.

### Core tokens

| Purpose | Token | Value/role |
|---|---|---|
| Product void | `--relay-void` | `#080a09`, primary shell background |
| Dark surface | `--relay-surface` | `#111512`, panels and overlays |
| Raised dark surface | `--relay-surface-raised` | `#1a201b`, inputs and menu hover |
| Dark border | `--relay-surface-border` | `#303a32` |
| Dark text | `--relay-text` | `#f3f6ec` |
| Muted dark text | `--relay-muted` | `#9aa596` |
| Primary lime | `--relay-lime` | `#d6ff32`, primary action and focus |
| Strong lime | `--relay-lime-strong` | `#b8ed00`, icon/link emphasis |
| Soft lime | `--relay-lime-soft` | `#efffc4`, selected/soft background |
| Canvas | `--canvas` | `#f5f7f1`, graph and dashboard background |
| Ink | `--ink` | `#101410`, light-surface text |
| Muted text | `--muted` | `#687064` |
| Light border | `--line` | `#e1e6dc` |
| Light panel | `--panel` | `#fffef9` |
| Spacing | `--space-1` … `--space-7` | 4px–32px rhythm |
| Type scale | `--text-xs` … `--text-xl` | 10px–24px product scale |
| Type weight | `--weight-medium` … `--weight-extrabold` | 600–800 |

Compatibility aliases such as `--accent`, `--nav`, `--soft-purple`, and
`--surface-dark` remain intentionally available so existing feature CSS can be
migrated incrementally without changing component APIs.

## Usage rules

1. **Primary actions:** use lime with dark text. Examples: Run test, Save,
   Create workflow, and the main authentication submit action.
2. **Live external side effects:** use the existing amber live treatment for
   Go Live and confirmation steps. Lime means primary/safe action; amber means
   the user is about to cause an external side effect.
3. **Errors and warnings:** use semantic tokens (`--semantic-danger`,
   `--semantic-warning`, `--semantic-info`, `--semantic-success`). Do not use
   lime to communicate failure.
4. **Provider identity:** Google, Drive, Sheets, Discord, Telegram, Steam,
   GitHub, Meta, and other provider icons retain their recognizable brand
   colors. The product shell must not recolor them to the accent.
5. **Surfaces:** light canvas and cards are for reading and graph work; dark
   shell, menus, drawers, credential panels, execution history, and runtime
   overlays are for control/status surfaces.
6. **Typography:** use the system sans stack for product text. Use monospace
   only for IDs, expressions, logs, webhook URLs, and JSON.
7. **Shape and depth:** use `--radius-sm`, `--radius-md`, `--radius-lg`,
   `--shadow-soft`, and `--shadow-dark`; do not introduce one-off radii or
   shadows without a documented reason.
8. **Motion:** use `--motion-fast` for feedback and `--motion-standard` for
   layout transitions. Every new animation must respect
   `prefers-reduced-motion` and must not delay an action.
9. **Accessibility:** retain visible focus, textual loading/error status, and
   enough contrast for dark and light surfaces. Do not communicate state by
   color alone.
10. **Theme parity:** every new surface must be readable in both
    `data-theme="light"` and `data-theme="dark"`; do not use a hard-coded white
    or black background for product UI.

## Reusable recipes

The first shared CSS recipes are intentionally framework-agnostic:

- `.ui-surface-dark` — dark panel base;
- `.ui-kicker` — uppercase section label;
- `.ui-button` with `--primary`, `--secondary`, `--ghost`, and `--danger`
  variants.

Existing classes (`.run-button`, `.save-button`, `.ghost-button`, dashboard
buttons, and overlay classes) are compatibility surfaces. They now consume the
same tokens through the migration overrides in `globals.css`; new features
should prefer the `ui-*` recipes or a typed component wrapper when one exists.

### Component and utility audit

Tailwind CSS v4 is installed through `@tailwindcss/postcss` and imported from
`globals.css`, but it is currently a compatibility/tooling layer rather than
the primary styling system. Most existing screens still use feature-scoped CSS
selectors. The current `.ui-*` recipes are reusable CSS contracts, not a
typed React component library yet.

Do not describe the product as having a complete shared component system until
the next UI foundation slice adds typed primitives for `Button`, `IconButton`,
`Field`, `Select`, `Menu`, `Dialog`, and `Status`. Those primitives should
consume these tokens and replace route-specific variants incrementally. A
feature may keep a legacy selector temporarily, but new buttons and form
controls must use a shared primitive or document why they cannot.

Workflow connection handles have a deliberately separate visual dot and
interaction hit-area: the dot is 12px, while the pseudo-element hit-area is
32px (`inset: -10px`). Keep this minimum target size, preserve keyboard focus,
and retain the `Drag to connect` title/accessible label when changing node
markup. The hit-area must not change the edge geometry or hide adjacent output
labels.

## Non-goals and forbidden drift

- Do not reintroduce violet as the product-wide primary accent.
- Do not use arbitrary navy values for new dark surfaces.
- Do not flatten provider logos into the product accent.
- Do not import marketing-only Relay WebGL, smooth scrolling, or hero effects
  into the authenticated workflow application.
- Do not copy purchased Relay source until the license and package manifest
  have been reviewed after purchase.

## Purchased-template migration checklist

When Relay is purchased:

1. inspect its actual token/typography/spacing manifest;
2. compare it to this file and `design-system.css`;
3. preserve workflow semantics, credential boundaries, and execution safety;
4. map its components into these semantic tokens instead of scattering template
   values through feature CSS;
5. visually review auth, dashboard, editor, credential, execution, and error
   states at desktop widths;
6. run `npm run verify` and record any intentional deviations here.
