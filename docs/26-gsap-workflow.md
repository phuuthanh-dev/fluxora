# GSAP skills and animation workflow

## Installation and ownership

The owner requested the official GreenSock skills on 2026-10-29 while the
homepage readability/motion slice was in progress. Eight upstream skills are
pinned to `aed9cfd3277740755f6bfc1155c7aa645403b760`:
https://github.com/greensock/gsap-skills/tree/aed9cfd3277740755f6bfc1155c7aa645403b760/skills

- User installation: `~/.codex/skills/gsap-*` on the current machine.
- Repository installation: `.agents/skills/gsap-*`, tracked with MIT notice and
  provenance. These files are agent instructions, not shipped browser assets.
- No skill auto-update, npm lifecycle hook or new runtime dependency is added.
  Codex can discover newly installed skills on the next turn. This session reads
  the installed instructions directly to apply them immediately.

## Choose the smallest relevant set

| Work | Read |
|---|---|
| Tweens, easing, media preferences | `gsap-core` |
| React/Next lifecycle and scoping | `gsap-react` |
| Scroll sections, scrub or pinning | `gsap-scrolltrigger` |
| Multi-step sequencing | `gsap-timeline` |
| Performance review | `gsap-performance` |
| Specific plugin, e.g. Flip/SplitText | `gsap-plugins` |
| Mapping/interpolation helpers | `gsap-utils` |
| Vue/Svelte integration | `gsap-frameworks` |

Read selected SKILL.md files fully; do not load all eight into every task.
Upstream recommendations do not override Fluxora's product boundaries. Verify
examples against installed versions; a skill is guidance, not executable proof.

## Fluxora implementation contract

1. Keep scroll choreography, WebGL and Lenis in the marketing feature. The
   owner's 2026-10-29 request extends short GSAP interaction motion to shared
   product primitives. Gilroy and semantic tokens remain the product foundation;
   official Relay marketing typography is scoped to the landing.
2. Run animation setup inside a client effect. Register plugins before use.
   Existing `useEffect` plus scoped `gsap.matchMedia` is sufficient; the React
   skill explicitly permits context cleanup without adding `@gsap/react`.
3. `matchMedia` already creates a context. Do not nest another `gsap.context`
   inside it. Revert the owned media context on pause/unmount and handle manual
   listeners/resources separately. Never kill all application ScrollTriggers.
4. Prefer transform/opacity for entrances; stagger small groups. Use timelines
   with labels for multiple phases rather than chained arbitrary delays. Keep
   the existing handoff's measured geometry; optimization is separate work.
5. Keep readable server markup, reduced-motion and pause paths. The first
   reveal frame remains readable; do not hide focusable controls with opacity 0.
6. Preserve one GSAP/Lenis/Three.js ticker. Refresh after actual layout changes, not
   on each animation frame. Do not add another smooth-scroll owner or global
   tween defaults to implement one section.
7. Verify the affected motion in an ordered recording and at mobile/tablet/
   desktop sizes; exercise pause, preferences, route exit, no-JS and no-WebGL.
   Run the repository gate and record actual failures without weakening CI.

## Shared motion ownership

`components/ui/ui-motion.ts` owns short interaction timing and lifecycle:
180ms surface entrance, 280ms progress interpolation, 320ms disclosure, with
`power2.out`. Feature code uses these primitives instead of duplicating tweens.
The unused `motion` package is removed; GSAP owns the former hero pointer tilt.

| Surface | Owner and behavior |
|---|---|
| FAQ | Shared `Disclosure`; independent answers, measured height, reversible from the current frame; real +/− state |
| Dashboard Execution Center | Shared controlled `Collapse`; mounted content becomes hidden/inert after close; no extra fetch on animation |
| Saved execution views / retention | Native `details` enhanced by the same `Disclosure` |
| Account, workflow, credential, editor menus | Shared `Menu` with 6px/opacity entrance; keyboard focus is immediate |
| Credentials, workflow commands, execution dialogs | Shared `Dialog` entrance; existing focus trap and Escape remain owners |
| Editor inspector drawer | Shared surface hook replaces its CSS entrance |
| Progress | GSAP scale interpolation; indeterminate motion pauses offscreen/hidden tab, observes the stationary track |
| Landing mobile menu / product tabs | Shared short surface hook; landing pause preference disables it |
| Hero demo | Scoped GSAP quickTo pointer tilt; fine mouse pointers only; controls and keyboard reset tilt |
| Section/footer entrances | `LandingReveal` with ScrollTrigger; footer groups retain 0.07s stagger |

FAQ rows have no scroll-entry transforms or exclusive `details name` grouping:
closing a preceding answer automatically used to move the clicked question.
The disclosure keeps content measurable until closing completes, uses `hidden`
at rest (closed native details can retain a nonzero measured box in Chromium),
and restores automatic height after completion so text can wrap on resize.
Inner ResizeObserver retargets active expansion; reversals release old tweens.
Reduced motion, pause, unmount and preference changes settle to the desired
state. Native details work without JavaScript; controlled product panels keep
their normal React requirement. No action waits for an animation to finish.

The first correction deferred a rebuild until disclosure completion. Owner
visual feedback showed that this still produced a visible jump. The final
contract keeps one Lenis instance, plane, material, clock and DataTexture for
the renderer lifetime. Layout notifications are coalesced; after disclosure
settles, a 600ms GSAP tween interpolates the existing 2,048-entry field and its
coordinate range. Interruptions capture the last rendered field. No new GPU
texture, buffer or shader program is allocated for this change.

Ribbon scroll coordinates use absolute document pixels, not progress times
the changing page height. Lenis smooths wheel input; ScrollTrigger continues
to own section/pin choreography and refreshes after actual layout changes.
Pause, hidden tab, renderer failure and route exit retain their existing cleanup.
Do not tie runtime effect dependencies to measured page dimensions again.

Regression lesson: stable DOM/scrollY alone does not establish background
continuity. `ribbon-layout.spec.ts` instruments GPU resource allocation, path
uniform interpolation, clock continuity and scroll-listener teardown across
FAQ and viewport changes, with a recorded visual sequence. Lenis CSS class
changes are not proof of instance teardown. No universal FPS claim is made.

Keep CSS button feedback, focus rings, skeleton/spinner indicators, and React
Flow canvas/edge interactions with their existing owners. Do not animate data
tables or every rerender. Product scrolling stays native; do not bring the
landing ribbon, Lenis or pinned sections into operational screens.

Public body/FAQ/footer sizes and readability evidence are in
`22-public-landing-v2.md` and the current slice report. Further options are SVG
connector drawing, sample-chart entry and subtle fine-pointer CTA feedback.
Add them as bounded follow-ups with visual proof, rather than enabling plugins
or effects merely because a skill is installed.

## Sources

- [GreenSock skills](https://github.com/greensock/gsap-skills).
- [OpenAI: repository skills and AGENTS.md](https://developers.openai.com/blog/skills-agents-sdk).

Connection creation now reuses `Collapse`. Shared Menu content mounts only while
open and its summary click is controlled by React; native delayed `toggle`
events must not reopen a menu after Escape. The existing surface hook receives
the open state and cleans up on close. Repeated keyboard dismissal and actual
menu absence are asserted in product-experience E2E.

## Relay template completion (2026-10-30)
The supplied intro, board boot and packet loops use scoped GSAP timelines;
no second RAF/spring library is added. Intro release is bounded, skippable and
restores overflow/inert on every exit. Hero packets stop offscreen/hidden/paused.
Frosted layers must be viewport-bounded to avoid document-sized filter rasters.
Statement motion clips a square-first shell while keeping copy at natural scale;
run-planner digits retain an accessible textual output. See docs/30.

## P0–P2 finishing contract (2026-10-30)

The landing's final Relay-informed pass remains deliberately small: the Product
section receives a dark reading veil whenever the lime stream passes behind it;
the navigation begins optically light and becomes a bounded frosted plate after
the hero threshold; and the desktop cursor/hero depth are fine-pointer-only.
The integration rail is a single scoped GSAP timeline (rail first, then app
icons), while reliability cards use existing `LandingReveal` entries. The footer
continues to use its existing reveal owner and adds only CSS fine-pointer
elevation, so it remains fully static for touch and reduced motion.

The visible sample pauses longer at its first active node. That is product
feedback, not network latency: its browser scenario is explicitly `test.slow()`
and gives the final illustrative status a 15-second assertion budget without
relaxing any product/API journey. Cursor exit uses a related-target-aware
`mouseout` listener; all new cursor/rail work reverts through the existing
`gsap.matchMedia` context. Do not use nested `gsap.context` inside that media
context or add an additional ticker.

The intro must be the first visible frame in the server HTML, then dismiss only
after its client-side readiness choreography; otherwise visitors see a static
landing flash before the GSAP sequence starts. The no-JavaScript path explicitly
hides that loader. Integration inventory uses a fixed icon slot and card rhythm.
Never stretch or repeat a narrow decorative source slice across a section: the
Relay accent is a small vertical element, not a full-width background.

Prewarm the decorative Three scene and prepare the hero GSAP timeline behind
the intro overlay. Start the hero timeline when the lime plate begins to fold,
or immediately when the visitor skips the intro. `introReady` remains an interaction guard (for example, the sample
run button), not a mount gate for those first-viewport visual systems. Mounting
the canvas and hero timelines only as the overlay disappears produces a second,
false “reload” beat. Scroll-pinned and offscreen section geometry remains
gated until the intro completes, because it must measure the final document
geometry.

The statement dock reads fresh geometry on native scroll and schedules one
coalesced follow-up frame for sticky mobile layout. That is a bounded layout
settle; cancel it on cleanup. During docking, the existing GSAP ticker follows
the destination while its section reveal moves, and is removed on cleanup.
