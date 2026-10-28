# Task contract

## Identity
- Task ID: `2026-10-29-landing-art-direction`
- Base commit: `5842b77`
- Working branch: `codex/relay-landing-foundation`
- Implementer: Codex
- Reviewer: project owner

## Outcome
Elevate the existing public landing into a cohesive, product-led visual experience with original procedural assets, readable hierarchy and a working local workflow demonstration.

## Target slice IDs
- `L12.3`

## Reopen justification
The owner explicitly requested a stronger visual implementation and self-created assets after the v2 delivery. The current page has a static demo, generic repeated blocks, an unsupported 98.7% success claim, and barely visible WebGL decoration. This is a changed visual requirement, not a repeat implementation of the existing auth or product features.

## In scope
- Landing-only composition, typography, procedural SVG/Three.js visual, responsive navigation, sample workflow replay, native FAQ and useful workload calculator.
- Consolidate landing styles; preserve existing global brand tokens and app routes.
- Progressive motion, keyboard interaction, no-JS/no-WebGL/reduced-motion fallbacks.
- Owner supplied the Relay MP4 during implementation and explicitly requested
  reverse engineering of its scroll-linked green stream and missing sections.
  Extend this revision with one fixed decorative shader layer, a folding lime
  statement, reliability, illustrative daily activity and useful workflow cases.
  Supersede the prior hero-only WebGL boundary. The owner subsequently approved
  the explicit Three.js + custom GLSL noise + Catmull-Rom + GSAP ScrollTrigger /
  Lenis brief. Implement continuous slow flow with a pause control; synchronize
  scrolling and rendering through one ticker and destroy it on route exit,
  pause, reduced motion or hidden tab. Do not claim access to Relay source.

## Explicitly out of scope
- Authentication, execution engine, provider calls, external credentials, deployment, PR/merge.

## Acceptance criteria
- [x] Hero and lower sections share coherent visual hierarchy on desktop/tablet/mobile.
- [x] Sample run advances through real UI states without network side effects; no fabricated production metrics.
- [x] Keyboard, reduced-motion, no-WebGL and no-JS paths remain useful.
- [x] Three.js is bounded, lazy, visibility-aware and uses locally generated geometry with a static visual fallback.
- [x] Focused Playwright, visual review and full `npm run verify` pass.
- [x] Scroll lighting moves through the page without blocking input or text;
  newly added sections are responsive and sample data is clearly identified.

## Required evidence
- Tests: landing interactions, fallback paths, narrow layouts, overflow.
- Commands: agent:task:check, codegraph:generate, targeted Playwright, npm run verify.
- Screenshots: desktop hero, lower sections, mobile and tablet.

## Safety boundaries
No real provider calls, secrets, deployment or publication. Keep visual assets local and inspect the final diff.
