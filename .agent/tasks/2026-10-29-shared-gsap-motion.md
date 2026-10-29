# Task contract

## Identity
- Task ID: `2026-10-29-shared-gsap-motion`
- Base commit: `03f58544eaa187141bc874851cc84e6e309ae5c4`
- Working branch: `codex/shared-gsap-motion`
- Implementer/reviewer: Codex (GPT-6 Astra)

## Outcome
Smooth FAQ disclosure and reusable GSAP interaction motion throughout existing UI primitives.

## Target slice IDs
- `L12.3`
- `L13.1`

## Reopen justification
Owner reports abrupt FAQ layout shifts when switching +/- and explicitly requests GSAP adoption across the project. Native exclusive details currently hide content instantly, and row entrance transforms compete with disclosure layout.

## In scope
Shared disclosure, entrance and progress motion; FAQ, menu/dialog/inspector and product disclosures; replace remaining Motion tilt with scoped GSAP; document motion ownership and coverage.
Owner follow-up: remove final-layout ribbon jumps too. Keep renderer/texture/Lenis lifetime stable, interpolate path data, and decouple scroll coordinates from total page height.

## Explicitly out of scope
Provider calls, credentials, OAuth form submission, backend behavior, releases and changing the ribbon's visual art direction.

## Acceptance criteria
- [x] FAQ open/close and rapid reversal interpolate from the current size; no text scaling, scroll jump or stale clipping.
- [x] Shared primitives retain focus, keyboard, reduced motion, theme and SSR/no-JS behavior.
- [x] GSAP motion is reusable across product routes, with bounded cleanup and no competing owners.
- [x] Layout changes reuse GPU resources/Lenis and morph path data continuously; the light does not jump when the user stays at the same scroll position.

## Required evidence
Focused browser interaction and temporal recording; responsive/no-JS/reduced-motion checks; typecheck, generated import graph and npm run verify.

## Safety boundaries
Local branch/commit only. Tests use synthetic data. No provider or production changes.
