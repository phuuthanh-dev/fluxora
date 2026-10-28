# Global design system

**Status:** v1 active, Relay-inspired
**Decision date:** 2026-10-25
**Owner:** Fluxora product

This document is the source of truth for the visual foundation shared by the
public landing, dashboard, editor, authentication screens, credential
surfaces, execution views, and future routes.

## Intent

The product uses the purchased Relay prompt as a visual reference for its
public landing: near-black surfaces, lime energy, engineered spacing, and
quiet movement. The Fluxora implementation is clean-room code: the purchased
source has not been imported, extracted from the preview, or committed to this
public repository. These values remain an intentional Fluxora adaptation, not
a claim of pixel-perfect or proprietary Relay tokens.

The application keeps a light workflow canvas because graph readability and
long-running configuration work are more important than copying a marketing
hero. The shell, command surfaces, drawers, dialogs, and runtime overlays use
the near-black foundation.

Light mode is the default product presentation. Dark mode keeps the same
Relay-inspired shell and lime hierarchy but moves the dashboard, canvas,
inspector, forms, cards, and graph controls onto dark reading surfaces. The
choice is stored under `fluxora-theme` and is applied by the
shared client toggle on mount. The default light presentation keeps the first
render stable, while subsequent visits restore the saved choice. The toggle is
available on auth, dashboard, and editor surfaces.

## Token source

The implementation source is:

- `apps/web/src/app/design-system.css` — global tokens and reusable recipes;
- `apps/web/src/app/globals.css` — legacy class migration and route-level
  composition;
- `apps/web/src/app/fonts/` — local Gilroy family copied from the
  VietAuction source project and loaded through `next/font/local`;
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
| Text hierarchy | `--text-secondary`, `--text-tertiary` | Readable supporting text for the current theme |
| Text link/icon accent | `--text-accent` | Accessible lime-family emphasis; never raw lime on a light surface |
| Selected control | `--control-selected-*` | Background, border, and text for active filters/tabs |
| Provider icon tile | `--provider-tile`, `--provider-*` | Theme-safe icon tile and provider mark variants |
| Action text | `--text-on-accent`, `--text-on-accent-soft`, `--text-on-live` | Fixed readable text on lime, soft-lime, and amber actions |
| Light border | `--line` | `#e1e6dc` |
| Light panel | `--panel` | `#fffef9` |
| Spacing | `--space-1` … `--space-7` | 4px–32px rhythm |
| Type scale | `--text-xs` … `--text-xl` | 10px–24px product scale |
| Type weight | `--weight-medium` … `--weight-extrabold` | 600–800 |
| UI font | `--font-ui` | Fluxora Gilroy, Arial fallback |

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
   identity. The product shell must not recolor them to the accent. Single-color
   marks use `--provider-*` so dark marks such as Steam, GitHub, and OpenAI
   receive an accessible light variant on dark tiles.
5. **Surfaces:** light canvas and cards are for reading and graph work; dark
   shell, menus, drawers, credential panels, execution history, and runtime
   overlays are for control/status surfaces.
6. **Typography:** use the local Gilroy family through `--font-ui` for all
   product text. Use the bundled 500/600/700 weights consistently; use
   `--font-mono` only for IDs, expressions, logs, webhook URLs, and JSON.
7. **Text hierarchy:** primary labels, node titles, and interactive control
   labels use `--text-on-dark` on dark surfaces; descriptions, hints, and
   supporting metadata use `--muted-on-dark`. On graph nodes, category labels
   use `--accent-strong` and output labels must remain readable without relying
   on color alone. Do not use light-theme gray tokens on dark surfaces.
8. **Shape and depth:** use `--radius-sm`, `--radius-md`, `--radius-lg`,
   `--shadow-soft`, and `--shadow-dark`; do not introduce one-off radii or
   shadows without a documented reason.
9. **Motion:** use `--motion-fast` for feedback and `--motion-standard` for
   layout transitions. Every new animation must respect
   `prefers-reduced-motion` and must not delay an action.
10. **Accessibility:** retain visible focus, textual loading/error status, and
   at least 4.5:1 for readable text and 3:1 for non-text UI/icons in both
   themes. Disabled controls may be de-emphasized, but must retain a clear
   disabled affordance. Do not communicate state by color alone.

## Public landing motion and WebGL

Motion and WebGL are progressive decoration for the public marketing route
only. They must never gate copy, navigation, calls to action, or product
status. The authenticated dashboard, editor, Connections, Executions, and
authentication screens remain HTML/CSS application surfaces.

- Use `MotionConfig reducedMotion="user"` and keep the server-rendered state
  readable before client hydration. Do not begin an information-bearing region
  at zero opacity, translated off-screen, or blurred.
- Three.js scenes live in client-only landing feature islands. Semantic HTML
  and CSS are the fallback when WebGL is unavailable, JavaScript fails, or
  reduced motion is requested.
- Mount a scene only while it is near the viewport and the document is visible;
  unmount it otherwise so its render loop and GPU resources are released.
- Cap the canvas DPR at 1.5, keep geometry/draw calls bounded, and do not add
  post-processing, controls, remote models, texture downloads, or autoplay
  video without a measured product need and an updated performance budget.
- Never use a canvas as the only indicator of a live status, execution result,
  or interaction. Every state remains textual and keyboard-accessible.
11. **Theme parity:** every new surface must be readable in both
    `data-theme="light"` and `data-theme="dark"`; do not use a hard-coded white
    or black background for product UI.
12. **Lime is a surface color, not universal foreground text:** use
    `--text-accent` for text/icons on light surfaces, `--text-on-accent` on
    lime fills, and `--control-selected-*` for active chips. Do not pair
    `--accent-strong` with `--relay-lime-soft` as foreground/background.
13. **Floating secondary actions:** use the shared secondary `Button` on
    `--panel`, keep its label on `--ink`, and reserve `--text-accent` for an
    icon or small emphasis. Never render lime text on a white or light panel;
    the same component must resolve to a dark panel with light text in dark
    mode.

## Reusable recipes

The first shared CSS recipes are intentionally framework-agnostic:

- `.ui-surface-dark` — dark panel base;
- `.ui-kicker` — uppercase section label;
- `.ui-button` with `--primary`, `--secondary`, `--ghost`, and `--danger`
  variants.

Existing classes (`.run-button`, `.save-button`, `.ghost-button`, dashboard
buttons, and overlay classes) are compatibility surfaces. They now consume the
same tokens through the migration overrides in `globals.css`. New features
should prefer the typed primitives in `apps/web/src/components/ui` and use the
legacy class only when a migration-specific selector is still needed.

### Component and utility audit

Tailwind CSS v4 is installed through `@tailwindcss/postcss` and imported from
`globals.css`, but it is currently a compatibility/tooling layer rather than
the primary styling system. Most existing screens still use feature-scoped CSS
selectors. The current `.ui-*` recipes are reusable CSS contracts, not a
typed React component library yet.

The typed primitive set is now available: `Button`, `IconButton`, `Field`,
`Select`, `Menu`, `Dialog`, `Status`, `PageHeader`, `EmptyState`, `Skeleton`,
and `Progress`. They consume the same tokens and are used by auth, dashboard,
editor overlays, editor actions, credential surfaces, and execution views. A
feature may keep a legacy selector temporarily for visual compatibility, but
new buttons and form controls must use a shared primitive or document why they
cannot.

All shared action and form primitives expose the same lime `:focus-visible`
outline. The outline is intentionally distinct from hover and selected states
so keyboard users can track focus in either theme.

### Keyboard and adaptive accessibility contract

- The Node Library treats search, category filters, app cards, and operation
  cards as one keyboard workflow. `/` enters search; Escape unwinds search,
  app detail, and the library in that order; arrow/Home/End navigation stays
  within the active collection.
- Shared `Menu` instances close on outside interaction, support arrow/Home/End
  navigation, and return focus to their summary trigger after keyboard
  dismissal.
- Shared `Dialog` instances own initial focus, Escape dismissal, and focus
  return. Modal dialogs and the responsive Inspector trap Tab/Shift+Tab;
  non-modal editor panels deliberately do not trap the rest of the editor.
- A 1440px desktop at 125% and 150% browser zoom is represented by 1152px and
  960px layout widths in Playwright. Save, Publish, Run test, and Go live must
  remain visible inside the command bar at both widths and in both themes.
- Under `prefers-reduced-motion: reduce`, non-essential pulsing, edge motion,
  drawer entry, hover transforms, and long transitions stop. Loading and
  operation state remain understandable through adjacent text and ARIA live
  regions; motion is never the only status signal.

Legacy class names such as `.run-button`, `.ghost-button`, and
`.dashboard-primary-button` are compatibility hooks during migration. They
must not become a second design system: the typed primitive owns semantics,
keyboard behavior, disabled state, and variants; the legacy class may only
provide route-specific sizing or placement.

Workflow connection handles have a deliberately separate visual dot and
interaction hit-area: the dot is 12px, while the pseudo-element hit-area is
32px (`inset: -10px`). Keep this minimum target size, preserve keyboard focus,
and retain the `Drag to connect` title/accessible label when changing node
markup. The target handle must remain absolutely positioned so React Flow can
center it on the node edge; only output handles may use relative positioning
inside `.workflow-node__output`. The hit-area must not change the edge geometry
or hide adjacent output labels. Dark node text and output labels must consume
the readable `--text-on-dark`/`--muted-on-dark` tokens rather than low-contrast
light-theme gray values.

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

1. keep downloaded source and license material out of this public repository;
2. inspect its token/typography/spacing manifest only if the licence permits;
3. preserve workflow semantics, credential boundaries, and execution safety;
4. map reusable principles into semantic Fluxora tokens instead of scattering
   template values through feature CSS;
5. visually review the landing before app surfaces at desktop widths;
6. run `npm run verify` and record any intentional deviations here.
