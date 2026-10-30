# Task contract

## Identity
- Task ID: `2026-10-30-relay-template-completion`
- Working branch: local `codex/relay-reference-adoption`, integrated into local `develop` after verification
- Implementer: Codex
- Reviewer: automated checks and owner visual review

## Outcome
Complete the owner-requested Relay choreography and section adaptation using the supplied source and original artwork, with Fluxora branding and truthful product content.

## Target slice IDs
- `L12.3`

## Reopen justification
On 2026-10-30 the owner explicitly requested the template preloader, hero board, logo open/fold/flight, frosted backgrounds and run-meter section. These exceed the preceding typography/assets/stream adoption; preserve that completed foundation and implement these concrete missing parts.

## In scope
- Bounded, skippable asset/font-aware ring → flood → fold intro.
- Hero glass board, staged boot, flow packets and illustrative run feed.
- Supplied square-first logo fold, reversible docking with the Fluxora glyph.
- Original section backdrop artwork and Product → Proof frosted slab.
- Run-volume meter and three planning cards using the template pricing layout, without invented commercial pricing or entitlements.
- Responsive, keyboard, no-JS, no-WebGL, pause/reduced-motion, cleanup and scroll stability.
- Focused visual/motion evidence, full verification, docs and local commit/integration.

## Explicitly out of scope
Remote push/deploy, billing, real provider calls, changes to authentication/database, publishing the paid source document or private correspondence.

## Acceptance criteria
- [x] Loading completes or can be skipped; page cannot remain locked after a failed asset or unmount.
- [x] Hero boot/flow/feed follow the source timing and pause offscreen/under reduced motion.
- [x] Logo folds through a square, docks and reverses on desktop/mobile without covering copy.
- [x] Original backgrounds and glass slab are visible without harming readability.
- [x] Run meter is keyboard-operable and cards contain truthful Fluxora content.
- [x] Visual checks and full `npm run verify` pass; local-only delivery is recorded.
