# Ribbon detail and particle refinement

## Identity
- Base commit: `e65b5de`
- Branch: `codex/relay-landing-foundation`
- Implementer: Codex

## Target slice IDs
- `L12.3`

## Reopen justification
The owner reviewed the previous motion correction and requested sharper detail
through the lower sections and more glowing particles. The current shader
deliberately softens every filament after the hero; this specific treatment is
being corrected, without rebuilding the landing or repeating completed slices.

## Outcome
Keep fine luminous threads visible throughout the ribbon, with a separate soft
glow and denser, irregularly spaced moving particles. The owner's follow-up
requests varied bright colors: lime, icy white, mint, blue, gold and violet.

## In scope
- Existing ribbon shader and its rendering budget.
- Native-GPU motion preview at the hero and lower sections; mobile review.
- Relevant documentation and the existing full verification gate.

## Explicitly out of scope
- New landing sections, libraries, provider calls, auth, engine, push or deploy.

## Acceptance criteria
- [x] Fine filament cores remain visible below the hero, independently of glow.
- [x] More particles with varied color, size, position and speed, without a visible grid.
- [x] Text, motion preferences, pause and fallback remain usable.
- [x] Recorded motion preview and `npm run verify` pass before local commit.

## Required evidence
- Existing landing E2E covers continuous motion, cleanup and fallbacks.
- Visual review at hero, middle, lower sections and mobile; no snapshot test
  will be treated as a substitute for visual acceptance.
- `npm run agent:task:check`, `npm run verify`, `git diff --check`.

## Safety boundaries
No external requests, credentials, deployment, publication or provider actions.
