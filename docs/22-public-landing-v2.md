## Official-reference adoption — 2026-10-30

The owner supplied the official Relay reconstruction specification and approved
adopting its marketing fonts, palette, GLSL stream and bounded bloom pipeline.
This supersedes the clean-room/no-import/no-postprocessing constraint below
for this landing-only slice. Product Gilroy, shared product semantics and
authenticated scrolling remain unchanged. Original email/prompt stay private.
Fluxora retains truthful product copy and working legal/support routes.
The same owner request extends adoption to a bounded ring/flood/fold intro,
four-node hero board with boot/packets/feed, square-first statement fold,
viewport-bounded frosted slab, run-volume planner and two-panel footer.
The planner reuses the pricing composition but does not invent a paid product.
See docs/30 for the current 24-asset manifest and motion contract.
See `30-relay-reference-adoption.md` for scope and provenance.

# Fluxora public landing — visual and interaction contract

## Current direction

The public root introduces Fluxora and leads into `/login`. The purchased Relay
reference supplies the dark/lime direction, serif emphasis, glass surfaces and
scroll choreography. Selected supplied artwork is bundled locally with provenance;
it is not relicensed as a standalone template. No third-party asset CDN,
template video or 3D model is required at runtime.

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
5. A dark, lime-outlined Fluxora badge that opens into a lime statement plate,
   folds back to a badge and docks in the following app diagram with scroll.
6. Reliability: reusable encrypted connections and the actual API/queue/worker/
   database architecture, with self-hosting instead of invented regional hosting.
7. A daily activity preview with selectable sample weekdays, completion gauge,
   waiting approvals and execution feed.
8. Practical workflow starting points instead of fictional customer metrics.
9. A time calculator with explicit assumptions instead of unapproved pricing.
10. Independent FAQ disclosures with GSAP height enhancement, CTA and footer.

The sample never connects to providers. Sample data is labelled. No uptime,
customer count, testimonial, success-rate or pricing claim may be invented.

## Module responsibilities

- `landing-page.tsx`: server-rendered composition.
- `landing-demo.tsx`: local sample state, responsive node edges and pointer tilt.
- `landing-showcase.tsx`: keyboard-accessible product tabs.
- `landing-handoff.tsx`: one scroll-controlled statement-to-diagram object.
- `landing-sections.tsx`: reliability, daily activity, workflow cases.
- `landing-interactions.tsx`: native menu/FAQ and workload estimate.
- `landing-motion.tsx`: scoped GSAP section entrances and shared pause state;
  readable before hydration. Shared UI motion also handles tilt/menu/tab/FAQ
  enhancement; the former Motion dependency is removed.
- `landing-scenes.tsx`: lazy renderer, SVG fallback, pause/visibility/preference.
- `landing-three-scenes.tsx`: page measurement, Lenis/ScrollTrigger ownership,
  perspective camera, bounded bloom composer and shared ticker.
- `landing-ribbon-geometry.ts`: Catmull-Rom spine, normals/turn radius and fixed-size GPU lookup texture.
- `landing-stream-particles.ts`: seeded particle/filament buffer generation.
- `landing-ribbon-shader.ts`: supplied Relay GLSL adapted for local uniforms.
- `public/relay/manifest.json`: exact sources and hashes of bundled vendor artwork.
- `landing.css`: route-scoped layout; superseded global landing CSS is removed.

Use landing-scoped Inter, Instrument Serif italic and Fragment Mono with the
official #c8f751 lime. Fonts are bundled through Fontsource; product Gilroy,
shared semantics and offline provider icons remain unchanged.

## Rendering and lifecycle contract

One fixed canvas sits behind content and never receives pointer events.
A document-descending Catmull-Rom spine follows measured section waypoints.
A 2,048 × 2 float texture stores center/pinch and normal/turn radius. The full
tier draws 36,000 seeded points and 44 filaments of 1,400 segments. Mobile/coarse
pointer tiers draw 45% of the points and 60% of filaments. Identified software
rasterizers use 25%/40% and a 25 FPS render ceiling; scroll input keeps its ticker.
The 35-degree perspective camera stays at z=6 with bounded pointer parallax.
The 2.6-second entrance does not replay on pause/resume. Absolute scroll position
moves the viewport through the field; accumulated scroll distance advances flow.

UnrealBloomPass uses strength .68, radius .57 and threshold .07 followed by
OutputPass. DPR is capped at 1.35 full / 1.2 mobile / .5 software; low-tier bloom
is half resolution. DOM text remains native resolution. Renderer detection is
local and never stored or sent. No user-agent/crawler performance bypass exists.
The composer is compiled/prewarmed before reporting readiness. Hardware FPS is
not claimed from headless test results.

A landing-owned GSAP ticker advances Lenis (`autoRaf: false`) and the Three.js
composer. React Three Fiber no longer owns this scene. Original decorative
artwork supplies hero/grid/bloom, integration glow, runtime orbits, proof lighting
and footer auroras, all from the local `/relay/` bundle.
No global ticker FPS or lag-smoothing setting is modified.

Pause, hidden-tab state, reduced-motion preference and WebGL failure remove the
renderer. Cleanup removes the ticker callback, kills only this page's tween and
trigger, destroys Lenis and disposes geometry, materials, texture, passes, composer and renderer. Leaving the landing restores
native scrolling. Touch scrolling remains native; section anchors preserve
their real URLs and offset below navigation.

The SVG fallback and semantic content remain useful with no WebGL or JavaScript.
Reduced motion also removes tilt/folding and completes the local demo immediately.
The pause button is keyboard accessible. Motion never carries exclusive status.

## Statement → runtime handoff (owner revision, 2026-10-29)

The owner's three-state brief and additional initial-icon screenshot supersede
the previous scale-X/rotate-X plate approximation. Use the Fluxora identity and
existing supported apps, preserving truthful product copy.

- 0–0.04: a compact dark badge with a lime outline; no copy or dot grid.
- 0.04–0.24: the shell opens into an approximately 84vw × 60vh lime plate,
  capped at 1100 × 560px. Copy/grid reveal as it opens; hold through 0.4.
- 0.4–0.7: copy/grid fade and the plate contracts to an 80px node. The badge
  stays legible independently of the outer shell's changing aspect ratio.
- 0.7–1: the same visible badge travels into the measured center of the app
  diagram. Its dark/lime treatment inverts; beyond 1 it follows the card's
  document position. Horizontal travel starts late so the desktop badge clears
  the heading and card copy before entering the diagram. Reverse scrolling
  retraces the entire transition.

CSS supplies a sticky viewport and stable scroll space; a scoped ScrollTrigger
maps scroll progress into the geometry. No additional ticker, smooth-scroll
instance, animation package, canvas or provider request is introduced. The
destination is measured again on refresh/resize/font readiness. Reliability
cards have stable geometry rather than a competing entrance transform.

The default server-rendered statement and diagram are both readable. The
scroll space is reserved before hydration only when scripting and motion are
enabled, preserving browser scroll restoration. Pause and reduced-motion
preferences restore the static layout and diagram mark. WebGL failure leaves
this DOM choreography usable with native scrolling. Cleanup removes only this
component's trigger/listeners/styles.

Functional regression must cover the initial icon, expansion, collapse, exact
docking, continued scrolling, reversal, resize, restored scroll, pause/resume,
preference changes, no-WebGL and no-JS. Record the forward/reverse sequence with
`LANDING_RECORD_VIDEO=1 npm run test:e2e -- e2e/landing-handoff.spec.ts --grep 1440px`.
This deterministic recording disables WebGL and proves the DOM choreography;
the existing landing tests cover WebGL/Lenis lifecycle separately. It is not a
GPU performance measurement. Visual acceptance remains separate from assertions.

## Verification

### Readability and section motion revision (2026-10-29)

Public explanatory copy is 15–16px, FAQ questions 18px and answers 16px.
Section labels and footer metadata are at least 12px; footer navigation is
14px. Compact illustrative UI uses an 11px floor instead of 6–9px. Mobile
coordinate decoration is hidden and node description space increases. Gilroy
remains the product family; the 2026-10-30 official reference moves marketing to
Inter and Instrument Serif italic, explicitly limited to display
emphasis. The native serif may vary across operating systems.

The shared LandingReveal now uses scoped GSAP/ScrollTrigger entrances (20px
rise, 0.75s, power2.out), replacing Motion reveals without stacking effects.
Footer groups stagger by 0.07s. FAQ rows no longer have entry transforms because
they compete with disclosure layout. Default markup is fully visible;
pause, reduced-motion changes and route exit revert only the owned context.
No extra RAF, Lenis instance, dependency or per-letter DOM splitting is added.
The owner's official GSAP skills are installed globally and pinned under
`.agents/skills/`. Their review removed a redundant context nested inside
matchMedia and moved the new reveal's registration into its client effect.
See `26-gsap-workflow.md` for skill selection and maintenance.
The reliability docking ancestors remain stable. FAQ uses a local dark reading
surface over the ribbon. The footer keeps real links and adds the source repo.

The subsequent FAQ correction uses the shared reversible height controller,
independent native disclosures, and a real minus indicator. Layout changes now
morph one persistent GPU path field instead of rebuilding geometry, texture or
Lenis. Absolute pixel scroll coordinates prevent total page height from moving
the current background. Pause/reduced-motion settles immediately, and native FAQ remains
usable without JavaScript. See `26-gsap-workflow.md` for the shared contract.

Potential later enhancements, subject to visual review: SVG connector stroke
draw in the narrative; scroll-linked sample bars with fixed final values;
light pointer response for CTA on fine pointers. Avoid pinning more text
sections, animating every letter or delaying clicks/FAQ disclosure.

Browser coverage must include the login boundary; local sample and no API calls;
no-WebGL/context-loss/reduced-motion recovery; pause/resume and restored native
scrolling; keyboard tabs; calculator assumptions; sample-day selection; desktop,
tablet and mobile overflow; no-JavaScript navigation and FAQ.

Inspect ordered motion sequences and a browser recording in addition to stills
and tests. Verify idle light changes while page scroll stays at zero. Run the full
repository gate before commit. Local verification does not imply deployment,
provider validation, exact equivalence to Relay's undisclosed source, or a
universal frame-rate guarantee.
