# Task contract

## Identity
- Task ID: `2026-10-30-relay-reference-adoption`
- Base commit: `eae6b6ee375a54ff80736e99d4a294c49842e45d`
- Working branch: `codex/relay-reference-adoption` (local only)
- Implementer: Codex
- Reviewer: local checks and owner visual review

## Outcome
Adopt the newly supplied official Relay specification for the Fluxora landing, with a private reference specimen, precise marketing typography/palette and a real particle/filament stream.

## Target slice IDs
- `L12.3`

## Reopen justification
The owner supplied `/Users/phungthanh/Downloads/relay.txt` on 2026-10-30 and approved the comparison and adoption plan. Earlier work used video inference and intentionally different fonts/palette/analytic shader. This is new evidence, not unfinished prior work.

## In scope
- Landing-only Inter/Instrument Serif/Fragment Mono, official lime palette and layout polish.
- Three.js particle/line shader, measured section spine, bounded bloom, one GSAP/Lenis ticker.
- Preserve FAQ layout morph, existing handoff, true Fluxora copy, app behavior and accessibility.
- Selected vendor artwork bundled locally, asset integrity and standalone/Docker packaging.
- Private local reference and provenance; do not commit email or the whole paid source document.

## Explicitly out of scope
Production deployment, remote push, auth/backend/database changes, fabricated customers/pricing, publishing the original paid bundle.

## Acceptance criteria
- [x] Local reference and section mapping are available for comparison.
- [x] Three official marketing fonts and #c8f751 are used without changing product typography.
- [x] Particle/filament stream retains its GPU/scroll lifetime across FAQ reflows.
- [x] Responsive, no-JS, no-WebGL, pause and reduced-motion paths remain usable.
- [ ] Focused browser checks, visual preview and full npm run verify pass.

## Required evidence
- Browser layout/lifecycle assertions, desktop/mobile screenshots, motion recording.
- npm run codegraph:generate; npm run verify.

## Safety boundaries
Local branch and commit only. Use no real credentials or provider actions. Original file stays outside tracked source.
