# Relay video analysis and Fluxora implementation

## Evidence

Owner-provided `relay-4ee0729d77.mp4`: 1920 × 1366, 30 fps, 10.433 seconds.
Reviewed a one-second contact sheet and individual frames at 3.3, 4.3, 5.4,
6.4, 7.4 and 9.4 seconds. The file records page UI and a cursor, rather than an
isolated background video.

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

The ribbon is a real 3D Catmull-Rom mesh with a noise-displaced vertex shader.
The fragment shader combines 24 filaments, travelling highlights and broad
analytic glow; it avoids downloaded media and expensive full-screen bloom
passes. Camera travel follows ScrollTrigger progress across measured sections.

One GSAP ticker advances Lenis and the R3F scene, with no second canvas RAF
or interval timer. Native touch scrolling is retained. Pause/reduced motion,
context loss, route exit and hidden-tab cleanup are explicit boundaries.

This reproduces the observed visual behavior with maintainable Fluxora code;
it is not a claim that Relay internally uses these exact formulas.

## Primary technical references

- [Three.js CatmullRomCurve3](https://threejs.org/docs/pages/CatmullRomCurve3.html):
  spline geometry and centripetal interpolation.
- [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/):
  normalized progress, scrubbed camera travel and owned-trigger cleanup.
- [Lenis integration guide](https://github.com/darkroomengineering/lenis):
  Lenis RAF driven by GSAP ticker, scroll synchronization, anchor options.

Use `22-public-landing-v2.md` as the current implementation/performance contract.
