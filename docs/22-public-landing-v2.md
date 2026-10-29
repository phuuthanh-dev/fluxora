# Fluxora public landing — visual and interaction contract

## Current direction

The public root introduces Fluxora and leads into `/login`. The purchased Relay
reference supplies the dark/lime direction, serif emphasis, glass surfaces and
scroll choreography. Fluxora owns the code and procedural assets in this repo.
No template video, remote texture or 3D model is required at runtime.

The owner reopened `L12.3` for stronger visual fidelity, supplied the Relay
MP4, and then explicitly approved Three.js, custom GLSL noise, Catmull-Rom,
GSAP ScrollTrigger and Lenis. This supersedes the earlier hero-only/no-Lenis
boundary. See `.agent/tasks/2026-10-29-landing-art-direction.md` and
`23-relay-video-analysis.md`.

## Visitor journey

1. Hero with a local Schedule → Steam → Google Chat run/stop/replay sample.
2. Offline provider icons using the existing product icon component.
3. Product tabs: workflows, execution evidence, encrypted connections.
4. Trigger → orchestrate → observe narrative, followed by the publish lifecycle.
5. A lime statement plate that opens and folds with scroll.
6. Reliability: reusable encrypted connections and the actual API/queue/worker/
   database architecture, with self-hosting instead of invented regional hosting.
7. A daily activity preview with selectable sample weekdays, completion gauge,
   waiting approvals and execution feed.
8. Practical workflow starting points instead of fictional customer metrics.
9. A time calculator with explicit assumptions instead of unapproved pricing.
10. Native FAQ disclosures, CTA and footer.

The sample never connects to providers. Sample data is labelled. No uptime,
customer count, testimonial, success-rate or pricing claim may be invented.

## Module responsibilities

- `landing-page.tsx`: server-rendered composition.
- `landing-demo.tsx`: local sample state, responsive node edges and pointer tilt.
- `landing-showcase.tsx`: keyboard-accessible product tabs.
- `landing-sections.tsx`: statement, reliability, daily activity, workflow cases.
- `landing-interactions.tsx`: native menu/FAQ and workload estimate.
- `landing-motion.tsx`: progressive entrance motion, readable before hydration.
- `landing-scenes.tsx`: lazy renderer, SVG fallback, pause/visibility/preference.
- `landing-three-scenes.tsx`: page measurement, Lenis/ScrollTrigger ownership,
  orthographic camera and shared ticker.
- `landing-ribbon-geometry.ts`: Catmull-Rom spine, smoothed width field and small GPU lookup texture.
- `landing-ribbon-shader.ts`: local Perlin gradient noise, moving filaments,
  bright packets and analytic soft glow.
- `landing.css`: route-scoped layout; superseded global landing CSS is removed.

Reuse global brand tokens, Gilroy and offline provider icons. Georgia supplies
marketing-only serif emphasis. Authenticated product typography and themes stay
under their existing design system.

## Rendering and lifecycle contract

One fixed canvas sits behind content and never receives pointer events.
A document-descending Catmull-Rom spine follows measured section waypoints.
A 2,048-entry float texture stores center, arc length, width and convergence;
one full-screen quad draws the light field without offset-mesh self-intersection.
There are 36 filaments, evaluated through the five nearest neighbors per pixel.
The hero has a 2.6-second time-driven entrance independent of page scrolling;
lower sections use softer focus. Initial geometry/texture compilation precedes
the ready state. Pause/resume does not replay the entrance.

DPR is capped at 1.25 and reduced to 0.5 on identified software rasterizers;
this local check is never stored or sent anywhere. DOM text keeps native pixel
density. The camera projection is manual and remains stable across density
changes. Missing float-texture filtering falls back to the SVG. Glow is
calculated in the shader instead of a multi-pass bloom framebuffer pipeline.

A landing-owned GSAP ticker advances Lenis and R3F. R3F uses
`frameloop="never"`; Lenis uses `autoRaf: false`. ScrollTrigger scrubs camera
travel; the shader continues a slow time-driven flow between scrolls.
No global ticker FPS or lag-smoothing setting is modified.

Pause, hidden-tab state, reduced-motion preference and WebGL failure remove the
renderer. Cleanup removes the ticker callback, kills only this page's tween and
trigger, destroys Lenis and disposes geometry and texture. Leaving the landing restores
native scrolling. Touch scrolling remains native; section anchors preserve
their real URLs and offset below navigation.

The SVG fallback and semantic content remain useful with no WebGL or JavaScript.
Reduced motion also removes tilt/folding and completes the local demo immediately.
The pause button is keyboard accessible. Motion never carries exclusive status.

## Verification

Browser coverage must include the login boundary; local sample and no API calls;
no-WebGL/context-loss/reduced-motion recovery; pause/resume and restored native
scrolling; keyboard tabs; calculator assumptions; sample-day selection; desktop,
tablet and mobile overflow; no-JavaScript navigation and FAQ.

Inspect ordered motion sequences and a browser recording in addition to stills
and tests. Verify idle light changes while page scroll stays at zero. Run the full
repository gate before commit. Local verification does not imply deployment,
provider validation, exact equivalence to Relay's undisclosed source, or a
universal frame-rate guarantee.
