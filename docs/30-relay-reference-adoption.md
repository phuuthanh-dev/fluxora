# Official Relay reference adoption

Owner supplied `relay.txt` from GetLayers on 2026-10-30. File SHA-256: `6b11e3e8a95394b6e2356760d519b7707bd7d4df05fe531b3c5cdca53bd0bbec`. The original document and correspondence are not tracked.

This is a reconstruction specification with shader excerpts, not a runnable
Next.js repository. The private reference specimen lives outside the repository
at `../relay-reference/`. It is a layout/color/type comparison, not a claim of
pixel-perfect reconstruction or a deployable service.

## Section map
| Relay | Fluxora |
|---|---|
| Navigation | Real login, product links and Fluxora identity |
| Hero refund flow | Four-node branching Steam/Sheets → Chat sample; staged board boot, moving packets and illustrative feed |
| Integrations | Supported offline provider icons |
| Product | Existing product tabs and workflow narrative |
| Statement | Square-first open/fold with the Fluxora glyph; measured reversible docking into the runtime |
| Scale | Reusable connections and actual self-hosted architecture |
| Signals | Clearly labelled daily activity sample |
| Proof | Practical workflow examples, no fictional customers or metrics |
| Pricing | Logarithmic run-volume planner and three planning profiles; no invented prices, quotas or capacity promises |
| Footer | Two original-style panels, Fluxora CTA and actual privacy/terms/support/source links |

## Rendering budget and deviations
- Landing fonts only: Inter, Instrument Serif italic, Fragment Mono, bundled locally. Product retains Gilroy.
- Marketing lime #c8f751; secondary hues #52c8ff and #eaff9e.
- Supplied spline/particle/filament GLSL is adapted behind the existing lazy scene boundary.
- 36,000 points / 44 filaments full tier; 45% points / 60% filaments mobile tier. Software rendering uses 8% points / 14% filaments with 240 segments per filament, no multipass bloom, DPR .5 and a 25 FPS draw ceiling while scroll input keeps its ticker. Detection uses actual GL renderer capabilities, never user agent or test markers.
- One GSAP/Lenis ticker; no new motion framework. The owner-requested intro is skippable and bounded, with a fail-open HTML default.
- One renderer/material/buffer set per scene lifetime. Each effect owns its canvas and explicitly releases its context on cleanup, including React Strict Mode replay. The unused R3F dependency is removed. Layout reflows morph curve data; actual viewport resize may resize render targets.
- Pause/reduced motion/hidden tab use the established semantic/SVG fallback. No crawler-specific performance shortcuts.
- Bloom is bounded by tier and DPR. No remote assets or provider calls at runtime.
- Owner explicitly requested prioritizing supplied artwork. All 83 manifest assets were retrieved privately; only 24 used decorative assets (589,396 bytes) are bundled in `apps/web/public/relay/`, with source URLs, byte sizes and SHA-256 in `manifest.json`. Provider icons and Fluxora identity remain unchanged.
- Vendor assets retain their original bytes; they are not relicensed as independently reusable open-source artwork. The private source document/email/full asset bundle are not tracked.

## Packaging
The web Docker runtime copies `apps/web/public` beside its standalone server.
The first standalone production-build smoke returned HTTP 200 for the landing and the initial
12 bundled images; each served SHA-256 matched the supplier bytes. The expanded
24-file manifest is covered by the asset-integrity browser check. Deployment
contract coverage guards this copy step. This is a local packaging check, not
an assertion that a new Docker image has been built or deployed remotely.

## Template choreography contract
- Intro: actual non-lazy image + font readiness, monotonic ring progress, inward lime flood, square-to-logo fold. A 4-second readiness deadline and 6-second hard release keep failed resources from locking the page. Skip/Escape and reduced-motion unlock immediately. SSR/no-JS stays fully readable; no pre-hydration blocking script.
- Hero: copy/grid/chrome/nodes/paths/feed enter at 0/.192/.288/.416/.608/.8 seconds. One 720ms packet travels the branching paths with a 1.2-second gap; every third packet uses the secondary path. Intersection/visibility/pause/reduced-motion suspend decorative work. Sample runs remain local and explicitly labelled.
- Statement: use `relayFoldBox` for tile → square → plate and the inverse; existing measured docking and reverse-scroll ownership remain. Glyphs do not shrink with the clipping shell.
- Frosted Product → Proof slab: a sticky 100svh pseudo-layer bounds backdrop rasterization; never blur a document-tall surface. Original product/signal/proof/background artwork stays local.
- Run planner: native keyboard-accessible logarithmic slider, GSAP digit rolls, three glass cards. The composition adapts pricing artwork without pretending Fluxora sells subscriptions.
- Footer: dark brand panel and lime action panel with local original blooms. No nonfunctional newsletter signup or fictional social proof.
- Detailed CSS compositions live in `landing-template.css`; old calculator/CTA CSS is removed rather than retained as a competing layout.

## Delivery evidence
Local delivery is verified: `npm run verify` passed with API 226/226, web
23/23 and 93/93 Playwright tests. The matching completion report records the
initial failures, their traces and the final recovery; no remote push, Docker
build or deployment is implied by this local result.
