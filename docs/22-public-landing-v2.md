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
There are 48 filaments, evaluated through the five nearest neighbors per pixel.
The hero has a 2.6-second time-driven entrance independent of page scrolling;
fine cores retain their definition through the lower sections. Depth changes
the separate halo rather than blurring the cores. Two bounded particle fields
use hashed positions, different speeds and sizes, with local derivative-based
stretch correction to keep pinpoints round at bends. The ribbon keeps its lime
hue, with particle accents in icy white,
mint, blue, gold and violet as requested by the owner. The central reading area
attenuates the light more below the hero. Initial geometry/texture compilation
precedes the ready state. Pause/resume does not replay the entrance.

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
remains the primary family; Georgia italic is explicitly limited to display
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
