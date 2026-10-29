# Task contract

## Identity

- Task ID: `2026-10-28-landing-animation`
- Base commit: `43bc32f`
- Branch: `codex/relay-landing-foundation`
- Implementer: Codex
- Reviewer: project owner

## Outcome

Make the public Fluxora landing feel precise and alive through progressive
Motion transitions and two bounded Three.js scenes, without changing the
authenticated workflow application or making WebGL a dependency for content.

## Target slice IDs

- `LANDING-ANIMATION-1`

## Scope and boundaries

- Add `motion`, `three`, React Three Fiber, and matching TypeScript types to
  the web workspace only.
- Lazy-load an accessible hero ring/light-stream scene and a lifecycle plate
  scene as client-only islands over existing semantic HTML/CSS fallbacks.
- Use intersection/visibility-aware rendering, a capped device pixel ratio,
  bounded geometry/draw calls, and resource disposal.
- Honor `prefers-reduced-motion`: no animated canvas, transform entrance, or
  parallax; the page stays complete and readable.
- Animate entrance/viewport transitions only on the public landing; do not add
  Motion/Three imports to dashboard, editor, connections, executions, or auth.

## Explicitly out of scope

- Imported Relay/Templify source, renderer, fonts, or assets.
- Three.js controls, post-processing, external textures/models, videos,
  analytics, provider/API calls, or changes to workflow execution/auth.
- Deployment, merge, or release action.

## Acceptance criteria

- [x] Landing content and CTAs render without waiting for WebGL.
- [x] Hero and lifecycle visuals progressively enhance only when motion is
  allowed and WebGL canvas creation succeeds.
- [x] Reduced-motion disables animated Three.js and preserves static fallback.
- [x] WebGL dependencies remain isolated to the landing feature bundle.
- [x] Focused browser tests cover default/reduced-motion/fallback behavior and
  `npm run verify` passes.

## Required evidence

- Tests to add or update: focused landing Playwright coverage including
  reduced-motion and client-scene fallback.
- Commands to run: `npm run agent:task:check -- .agent/tasks/2026-10-28-landing-animation.md`, `npm run codegraph:generate`, focused Playwright, `npm run verify`.
- UI/manual proof: desktop and mobile Chromium visual inspection, including a
  reduced-motion capture.

## Safety boundaries

- Do not use, print, commit, or request real provider credentials.
- Do not deploy, publish, merge, alter CI secrets, or make external provider calls.
- Update `docs/11-code-graph.json` after source imports change and produce a
  factual report before handoff.
