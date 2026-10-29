# Shared landing and product UI core

Owner request: 2026-10-29. Task: `UI-CORE-1`.

## Diagnosis

The landing header was a 94px sticky rectangle with an almost opaque fill.
Its visual weight interrupted the page-long ribbon. Product screens had a
separate set of compact but inconsistent styles, duplicated shell/auth rules,
synthetic font weights above the bundled 700 weight, and fixed navy/light text
inside overlays. Merely changing the landing stylesheet could not fix those
routes.

## Visual contract

- Use the existing Fluxora mark, Gilroy family and lime accent everywhere.
- Landing navigation is a 64px inset glass bar with a 12px sticky offset;
  mobile keeps an accessible menu in a 60px bar. The ribbon is unchanged.
- Workspace navigation is a compact theme-aware bar. Workspace selection,
  navigation, theme and the rightmost account menu keep their existing roles.
- Dashboard, Connections and Executions share PageHeader, content width and
  gutters. Page titles are 28–36px; product body is 14px, controls around 13px,
  secondary information 12px, and short technical metadata may be smaller.
- Light and dark modes apply to forms, menus and overlays as well as the
  canvas. Lime fill always uses dark text; light surfaces use the darker
  semantic accent for text. Semantic errors are separate from brand colors.
- Marketing display type, serif emphasis, smooth scrolling and WebGL stay on
  the landing. Operational pages retain native scrolling and focused controls.

## Route coverage

| Route | Implementation |
|---|---|
| `/` | Shared BrandLockup, compact glass navigation, keyboard mobile menu, existing landing sections/motion |
| `/login` | Shared branded navigation, responsive split layout, aligned fields, theme-aware OAuth/error states, accessible return to landing |
| `/dashboard` | Shared PageHeader, aligned cards/stats/create area and restrained hierarchy; existing collapsed execution center retained |
| `/dashboard/connections` | Theme-aware vault form/cards/menu, consistent spacing and readable OAuth links; no credential contract changes |
| `/dashboard/executions` | Shared page framing, list heading/rows, filters and existing empty/error/loading states |
| `/editor` | Same global shell, separate workflow toolbar, themed inspector/JSON/overlays and existing compact node/handle behavior |

## Ownership and reuse

1. `design-system.css` owns brand/semantic tokens and shared UI recipes.
2. `components/brand/brand-lockup.tsx` owns the logo signature.
3. `product-shell.css` owns auth and app shell layout. Their previous rules
   were removed from `globals.css`, including responsive variants.
4. `globals.css` retains editor and management composition. Existing hard-coded
   navy/purple control and overlay values migrate to semantic tokens in place.
5. `landing.css` owns marketing composition only. No second UI library is added;
   Tailwind v4 and the existing typed primitives remain the foundation.

Future routes should reuse PageHeader, SectionHeader, Toolbar, Button, Field,
Select, Menu, Dialog, Status and the shared app shell. Add a token only for a
reusable role; do not append another blanket override layer to fix one screen.

## Verification boundary

The `ui-core.spec.ts` matrix checks desktop/scrolled/mobile landing navigation,
mobile login, all authenticated pages in both themes, account focus return,
credential overlays, readable primary actions and supported-width overflow.
Existing regressions cover workflow commands at 125%/150% zoom equivalents,
node connections, provider forms, mock execution and credential lifecycle.
Screenshots use synthetic local accounts. The final report records actual
quality-gate results; no production release or real provider qualification is
implied by local UI validation.
