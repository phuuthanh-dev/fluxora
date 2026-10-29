# Relay video analysis and Fluxora implementation

## Evidence

Owner-provided `relay-4ee0729d77.mp4`: 1920 × 1366, 30 fps, 10.433 seconds.
The initial review used a one-second contact sheet and isolated frames. That
was insufficient to establish motion fidelity, as the owner correctly pointed
out. The correction reviews ordered 8 fps sequences over 1–3, 3–5 and 6–8 s,
and measures all 313 decoded frames at the source's 30 fps. It estimates white
text's vertical displacement separately from lime-color coverage, rather than
treating light movement as page scrolling. The file records page UI and a
cursor, rather than an isolated background video.

In the measured hero region, from 1.0 to approximately 1.73 s the estimated
text displacement is zero while lime coverage rises from about 0.1% to 51%.
These are region/threshold-specific diagnostics, not a reconstructed motion
curve or a claim of the original renderer's internals. They support a distinct
time-driven light entrance before sustained scrolling. The visual sequences
also show narrow convergence at the hero bend, a broad fan, a blue inner family,
soft lower-page focus and drifting particles. The previous narrow, evenly
spaced wires missed those properties.

The video establishes visual behavior, not the original source, exact library
versions or render pipeline. The supplied brief names Three.js/shaders/Lenis.
The owner subsequently explicitly selected the Catmull-Rom + GLSL noise +
GSAP ScrollTrigger + Lenis approach for Fluxora.

## Observed sequence and adaptation

| Approximate interval | Visible Relay composition | Fluxora equivalent |
|---|---|---|
| 0–1 s | Logo/intro transition over the hero | Existing Fluxora mark; readable first render rather than a blocking preloader |
| 1–3 s | Floating product window, diagonal multi-strand lime/blue stream, app row | Local Steam report demo, shared brand icons, continuous procedural stream |
| 3–5 s | Alternating feature rows, run timeline and weekly bars | Workflow product tabs and observable execution narrative |
| 5–6 s | Large lime statement plate with central logo | Scroll-linked lime plate and original Fluxora copy |
| 6–7 s | Reliability cards, runtime hub and region visualization | Credential hub plus real API/Redis/worker/PostgreSQL stack; no unsupported region promise |
| 7–8 s | Daily heatmap, completion ring, waiting work/feed | Interactive, explicitly illustrative weekday activity |
| 8–9 s | Customer metrics and testimonials | Concrete workflow starting points; no fabricated endorsements or metrics |
| 9–10.43 s | Pricing meter and three paid tiers | Explicit-assumption time calculator; commercial pricing remains unapproved |

The clip ends in pricing. It is not evidence of the template's complete FAQ,
footer or responsive behavior.

## Reconstruction

The corrected ribbon samples a Catmull-Rom spine into a 2,048-entry float
lookup texture and renders an implicit light field in one full-screen draw.
This replaces the broad offset mesh, which self-intersected inside tight bends.
The width envelope is smoothed independently of the spine. The fragment shader
combines 48 nonuniform filaments, time-driven entrance, travelling highlights,
Perlin billowing, a blue inner family and two layers of drifting particles.
After reviewing the motion correction, the owner requested more detail below
the hero. Fine cores now remain sharp independently of the soft halo; the prior
depth-driven core blur is superseded. Particle positions are jittered and their
local screen-space footprint is corrected at bends. This is an owner-directed
adaptation, not a claim that Relay uses the same particle construction.
The owner's additional request adds icy white, mint, blue, gold and violet
particle accents while retaining the lime ribbon. Positions and colors stay
stable per particle; the two fields drift at different speeds.
Only five neighboring filaments are evaluated per pixel. Glow is analytical;
there is no downloaded background video or multipass bloom pipeline.

The scene follows the existing ScrollTrigger/Lenis camera progress and uses a
manual orthographic camera so pixel-ratio changes cannot reset its projection.
The document-descending spine is intentionally a single-valued field in page Y.

One GSAP ticker advances Lenis and the R3F scene, with no second canvas RAF
or interval timer. Native touch scrolling is retained. Pause/reduced motion,
context loss, route exit and hidden-tab cleanup are explicit boundaries.

This is an iterative approximation of the observed choreography. Passing E2E
tests proves behavior and fallback handling, not visual equivalence to Relay.
The owner has not yet accepted the corrected motion's fidelity. No original
source inspection or human-equivalent uninterrupted video playback is implied.

Local motion evidence is recorded from the browser, including the initial
stationary hero and scrolling through sections, at
`/tmp/fluxora-motion-preview/final/fluxora-ribbon-motion.mp4`.
The measurement scratch data is `/tmp/relay-motion-measure.json`. These are
temporary development artifacts, not assets included in the site or repository.

The subsequent detail/color refinement is recorded in
`../previews/fluxora-ribbon-detail-multicolor-2026-10-29.mp4` and tracked by
`.agent/reports/2026-10-29-ribbon-detail.md`.

## Primary technical references

- [Three.js CatmullRomCurve3](https://threejs.org/docs/pages/CatmullRomCurve3.html):
  spline geometry and centripetal interpolation.
- [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/):
  normalized progress, scrubbed camera travel and owned-trigger cleanup.
- [Lenis integration guide](https://github.com/darkroomengineering/lenis):
  Lenis RAF driven by GSAP ticker, scroll synchronization, anchor options.

Use `22-public-landing-v2.md` as the current implementation/performance contract.
