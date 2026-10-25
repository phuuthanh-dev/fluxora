# GetLayers Relay UI research and adoption plan

**Research date:** 2026-10-25
**Scope:** Public GetLayers pages, public Textura repositories, and the Relay layer's public metadata. This document does not reproduce or infer proprietary template source.

## Executive decision

Relay is not evidence of a general-purpose component library comparable to Material UI, Ant Design, or shadcn/ui. The strongest public evidence points to a custom UI implemented with **Next.js and Tailwind CSS v4**, with motion and visual layers built using **React Spring**, **Lenis**, and **Three.js**.

For this application, adopt Tailwind CSS v4 as an incremental utility and design-token layer while preserving the existing component architecture and CSS during migration. Bundle provider icons locally with Iconify/React Icons; do not load icons from a public runtime API. Do not add Three.js, Lenis, or React Spring to the application shell until there is a concrete interaction that needs them or the purchased Relay source is available for an exact dependency audit.

## Evidence and confidence

### Relay itself

The public [Relay layer page](https://www.getlayers.ai/layer/relay) describes an animation-heavy workflow automation landing page. Its public metadata identifies `landing page`, `threejs`, and `nextjs` as its stack. The page metadata also contains implementation terms including `tailwind v4`, `react-spring`, `lenis`, `three.js`, reduced motion, and an adaptive grid.

No public Relay metadata inspected during this research named shadcn/ui, Radix UI, Material UI, Chakra UI, or Framer Motion. Therefore:

- **High confidence:** Next.js, Tailwind CSS v4, and Three.js are part of the Relay implementation.
- **Medium-to-high confidence:** React Spring and Lenis are used for interaction/motion behavior.
- **High confidence:** the visible result is primarily custom component and visual code, not a recognizable off-the-shelf UI kit.
- **Unknown until purchase:** exact package versions, folder structure, reusable component boundaries, and license constraints for copying components into this product.

### GetLayers/Textura house stack

The public [Next 16 Claude starter](https://github.com/textura-agency/next16-claude-starter) documents Next.js 16, Tailwind CSS v4, `@react-spring/web`, `spring-text-engine`, Lenis smooth scrolling, and a rem-based adaptive grid. The public [AI design vault](https://github.com/textura-agency/ai-design-vault) reinforces a server-first approach, design tokens, spring-based motion, and avoiding a second animation system.

GetLayers [documentation](https://www.getlayers.ai/docs) explains that a template is delivered as a Next.js source project. Prompt-based recreation is a separate self-contained HTML workflow, so it should not be treated as proof of the purchased template's exact source structure.

## Design characteristics worth adapting

Relay's public presentation is useful as a visual direction, not as the workflow editor's information architecture:

- high-contrast black/lime palette with restrained accents;
- glass/translucent cards over a visual background;
- technical monospace readouts paired with editorial typography;
- spring-like reveals and tactile hover states;
- reduced-motion awareness;
- large visual storytelling sections intended for a marketing page.

The workflow editor should adopt the clarity, tokens, motion discipline, and brand confidence. It should **not** import landing-page effects into dense operational screens where they reduce scanability or consume GPU unnecessarily.

## Repository changes in this slice

### Tailwind CSS v4 compatibility

- Added `tailwindcss` and `@tailwindcss/postcss` to the web workspace.
- Added the v4 PostCSS plugin and imported Tailwind from the global stylesheet.
- Used a small set of utilities in the provider-icon component to prove compilation without rewriting the current CSS system.
- Existing CSS remains authoritative while design tokens and reusable components are migrated incrementally.

### Provider icon system

- Kept Lucide for neutral workflow concepts such as schedule, webhook, branch, approval, and HTTP.
- Added locally bundled provider marks for Steam, Google, Google Drive, Google Sheets, Google Chat, Gemini, Discord, Telegram, OpenAI, MongoDB, GitHub, Facebook, and Instagram.
- Used Iconify's offline React renderer with individual `@iconify-icons/logos` imports for multicolor marks. This avoids a runtime icon API request and keeps each imported icon tree-shakeable.
- Used each provider's recognizable brand color when its official mark is single-color.

Iconify documents both local icon packages and runtime API loading. The project deliberately uses local data so the editor remains deterministic, private, and usable without a third-party icon service. See [Iconify icon data documentation](https://iconify.design/docs/icons/icon-data.html).

## Rules for purchasing and importing Relay later

Before copying any purchased source into this repository:

1. Record the template version, license, package manifest, and attribution obligations.
2. Compare its Next.js, React, Tailwind, PostCSS, TypeScript, and ESLint versions against this monorepo.
3. Import design tokens and isolated primitives first; do not replace the application routing, authentication, API client, or workflow state model.
4. Keep marketing-only Three.js and Lenis code outside authenticated dashboard/editor routes.
5. Use one motion system. If Relay depends on React Spring, migrate intentional interactions to it and avoid adding Framer Motion in parallel.
6. Respect `prefers-reduced-motion`, keyboard focus, semantic controls, and WCAG contrast in every ported component.
7. Run `npm run verify` and browser regression tests after each small migration slice.

## Recommended UI migration sequence

1. Extract color, spacing, radius, typography, elevation, and motion tokens into Tailwind/theme variables.
2. Build shared Button, IconButton, Menu, Dialog/Drawer, Field, Badge, EmptyState, Skeleton, and Toast primitives.
3. Apply them to the dashboard and node library before changing the canvas.
4. Standardize loading, success, error, disabled, and progress states.
5. Add React Spring only for interactions that are difficult to express safely with CSS transitions.
6. After purchasing Relay, audit the real source and update this document before importing any visual modules.

## Non-goals of this slice

- Recreating Relay from screenshots or public output.
- Adding Three.js to authenticated product screens.
- Replacing all existing CSS in one change.
- Depending on an external icon CDN/API at runtime.
- Claiming exact dependency parity before the purchased source is inspected.
