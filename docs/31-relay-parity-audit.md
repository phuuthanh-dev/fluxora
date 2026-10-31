# Relay reference comparison — 2026-10-30

Reference: owner-supplied `/Users/phungthanh/Downloads/relay.txt`; it describes
an intended reconstruction and contains snippets, not a runnable original site.
Fluxora keeps its own content and identity. Exact 1:1 visual, timing and behaviour
parity therefore remains unverified without the original runnable implementation.

| Area | Relay reference | Fluxora state / remaining gap |
| --- | --- | --- |
| Preloader | readiness counter, lime flood and logo fold | implemented with fail-open, skip and reduced-motion paths; exact timing and visuals require side-by-side review |
| Hero board | refund example, staged nodes, paths and feed | staged Fluxora workflow example and packets; node content and geometry differ |
| Integration rail | travelling packet activates each app and lights the dashed rail | responsive tiles, packet and moving gradient follow measured positions, with Relay-inspired lap timing; responsive composition and exact gradient remain different |
| Product feature rows | waterfall, approval and six isometric bars animate on entry | trace, approval and sample chart using original cube and cap SVGs now appear in Relay order and loop while visible; detailed content, timing and reset choreography remain approximate |
| Text reveals | rise and blur with a soft left-to-right mask | section and text reveals use a soft mask sweep; timing and spring curves are approximations |
| Statement handoff | lime plate opens, closes and docks into runtime | reversible scroll handoff and Fluxora glyph; geometry differs |
| Runtime hub | four app packets, counter-rotating orbits and breathing glow | six Fluxora app packets, supplied orbit/glow assets and visibility-aware motion; geometry and app count differ |
| Daily view, proof, pricing | animated sample dashboard, scroll-drifting proof blooms and paid pricing meter | five illustrative dashboard widgets, scroll-drifting original blooms, honest use cases and a planning meter; Fluxora does not claim Relay customer results, pricing or capacity |
| Slab and background | frost across product through proof, streamed background | bounded frost and particle stream; shader and rendering performance are adapted |
| Color | `#c8f751` primary lime | primary Relay token now shared by app and landing; contrast-specific and provider colors remain semantic variants |
| Typography | Inter, Instrument Serif, Fragment Mono | owner-selected original Fluxora Gilroy UI, Georgia serif and system monospace |
| Footer | supplied auroras and separately staged panel copy, CTA and links | local aurora assets and staged Fluxora content; geometry and fine-grained timing require visual comparison |

Claims about visual parity need a comparison at matching scroll positions and
viewport sizes on real hardware. Reduced motion, pause, keyboard access, readable
server-rendered content and accurate product descriptions take precedence over
copying decorative behaviour or fictional template copy.

## Order audit — 2026-10-31

- Relay: hero → integrations → product (trace, approval, chart) → statement → scale → signals → proof → pricing → footer.
- Fluxora: hero → integrations → product (trace, approval, chart) → statement/reliability → daily view → workspace preview → use cases → lifecycle → run planner → FAQ → footer. The preview, lifecycle and FAQ remain Fluxora additions; the reference does not establish 1:1 section parity.
- Card animations now repeat while visible and stop offscreen; timing, counters, fine-grained typing and reset choreography still differ. The visible Fluxora examples do not imply real runs or published pricing.

## Motion follow-up in progress — 2026-10-31

- Product now precedes statement and uses Relay's trace → approval → chart order. A separate Fluxora workspace preview remains after the daily view; lifecycle and FAQ are intentional additions.
- Integration highlighting uses measured tile centers; the reference uses additional rail gradient and responsive artwork not yet reproduced.
- Approval typing, chart cap glow, daily heatmap/gauge/feed/recovery and plan-card content are staged. Their exact per-frame spring behaviour and resets have not been verified against the reference.
- The video is a 10.43-second, 1920 × 1366 capture; it helps validate order and appearance but does not reveal source state or prove timing parity. Desktop and mobile comparison is still required after final implementation.

## Reference motion beats and Fluxora implementation — 2026-10-31

| Element | Relay specification | Fluxora mapping / limitation |
| --- | --- | --- |
| Feature title and body | rise 24px; focus from 8px blur with a soft left-to-right mask; title +70ms, body +140ms | rise and soft mask implemented; GSAP eases approximate the documented spring, and nested paragraphs require individual review |
| Trace | four spans start at 360/760/920/1040ms, checks draw later, run label types | Fluxora's sample label types, four bars grow, numeric sample timings count up, and check strokes draw independently; illustrative content and exact timing differ |
| Approval | typing dots at 240ms, message at 1160ms, fields 1360ms onward, play length 4472ms | dots, sample message and fields staged; waiting-minute count is intentionally not invented |
| Chart | six ascending bars start 240ms + 120ms each, caps 208ms later; glow after final cap; nominal play length 2072ms | original local SVGs, ascending illustrative proportions, staged caps and glow. The specified cap timing plus glow exceeds 2072ms with the current tween durations, so Fluxora lets the sequence finish rather than compressing it; exact curve needs reference comparison |
| Card loop | resolve → hold 2800ms → rewind 800ms; disarm offscreen | explicit separate playhead replaces yoyo hold on the empty frame; refresh no longer restarts an active visible loop |
| Daily widgets | staggered widget entry, diagonal heatmap wave, synchronized ring draw and numeric count, feed and curves; pause offscreen | sample widgets stage and loop, with ring and count sharing a timing curve; geometry and data are Fluxora examples, not Relay metrics |
| Run meter | keyboard range, text types on entry, rolling digits, active card and staggered feature checks | Fluxora planning range retains accessible native input; card checks draw and feature lines focus in; no fictional commercial price |
| Hero board and text | fixed boot sequence, packet, port flashes and a new feed row sliding above the previous rows, scroll/visibility gating | Fluxora stages the board, routes the packet with port flashes and slides the illustrative feed downward; source video must be compared frame by frame before claiming timing parity |

Owner requested the pre-Relay Fluxora typography: Gilroy UI, Georgia serif accents,
and system monospace telemetry. Typography is therefore an intentional deviation
from Relay Inter, Instrument Serif and Fragment Mono.

- Proof blooms use the supplied local artwork and drift in opposite directions with scroll, reverting for paused and reduced-motion modes. This follows the reference mechanism without its fictional testimonials or customer metrics.
- Fluxora pauses a visible illustration's playhead when it leaves the viewport and resumes it on return, preventing an abrupt restart during short reverse scrolls. Relay describes resetting after a card is fully offscreen; this is an intentional behavioural difference requested to address the reported jitter. The trace and chart use calculated easing based on the specified spring tension and friction; timing and visual fidelity still need comparison against a running reference.
- The integration rail likewise preserves its lap on refresh, resize and short departures instead of restarting from the first app; the source describes restarting when fully offscreen. This follows the owner's request to avoid abrupt resets.
- At narrow widths Fluxora displays all six supported integration tiles in a two-row grid and hides the horizontal rail; Relay's 390px frame instead shows a single rail with four selected tiles. Restoring a single mobile rail while keeping six readable branded names would require a deliberate interaction or a different composition, so the current implementation does not claim mobile rail parity.
- The return phase is 1600ms with a sine ease instead of the reference's 800ms for product cards, in response to the owner's request for a slower return. This is an explicit timing deviation rather than a claim of 1:1 timing.

## Local verification evidence — 2026-10-31

- Latest full default `npm run verify` after the chart timing change: workspace tests, typechecks and builds passed; E2E finished with 118 passed and one failure. The failed editor keyboard-navigation case timed out while its registration form was still pending; it passed when rerun alone with the default limit (2.5 seconds). The full gate therefore did not pass on this revision, and the isolated rerun does not prove its root cause.
- The previous full default `npm run verify` passed all 119 Chromium E2E cases, workspace tests, typechecks and production builds before the subsequent chart proportion and timing changes. Neither result proves frame-exact Relay parity.
- After the most recent changes, the five targeted Chromium cases for the hero feed, hero port flashes, runtime hub, daily gauge and planner feature text passed. These cases verify selected behaviour, not visual 1:1 parity or the whole product.
- An earlier `npm run verify` passed workspace unit tests, typechecks and application builds, but did not pass the complete E2E phase. Under high machine load it recorded timeouts in editor sign-up and account recovery, and the run was interrupted; 114 E2E cases did not run.
- The editor case subsequently passed alone. The account recovery case exceeded the normal 30-second test limit alone, then passed in 42 seconds with a diagnostic 90-second limit. That diagnostic run did not establish the root cause or pass the default gate; the later full successful run is recorded above.
- A subsequent attempt passed unit tests, typechecks and builds but recorded two five-second registration-navigation timeouts and one 30-second execution-history timeout; it was interrupted after 21 E2E passes, leaving 94 cases unrun. The three focused integration-rail cases subsequently passed, and the later full successful run is recorded above.
- After adding the moving rail gradient, its focused test exceeded the default 30-second limit once; a diagnostic run with a 90-second limit passed in 47.9 seconds. This shows the assertions could complete in that run, but is not a passing default-gate result or proof that load was the sole cause.

## Rendered comparison boundaries — 2026-10-31

The reference contact sheet was extracted from the supplied 10.43-second video;
desktop Fluxora screenshots were captured at 1440 × 900 after the intro. These
captures establish structure and appearance at individual moments, not matching
scroll coordinates, frame timing, live pointer motion or mobile parity.

| Area checked | Evidence from captures | Remaining evidence or discrepancy |
| --- | --- | --- |
| Hero | Both use a left headline, glass workflow board on the right, dark field and lime stream. The trigger is intentionally outside the board in Relay on desktop. | Fluxora has its own icons, extra interaction controls and workflow; frame-by-frame entrance and packet path remain unverified. |
| Product | Alternating text/card rows and a trace → approval → chart sequence exist in Fluxora. | The supplied video briefly shows the trace and chart, not a full loop for each card; detailed spring and reset parity is unproven. |
| Statement and runtime | Both transition to a bright plate followed by a central app hub. | Fluxora uses its own mark and six applications; exact FLIP trajectory and reference timing are unverified. |
| Daily view | Both have a two-card first row and three-card second row at desktop width. | Fluxora's sample data, selected-day control and widget content differ; mobile reference frames were not supplied. |
| Closing sections | Fluxora has an interactive run planner and footer. | Relay's pricing and customer metrics cannot be asserted for Fluxora; the planner and use-case content are intentional substitutions. |

At 375 × 812 with `prefers-reduced-motion: reduce`, locally rendered hero,
daily-view and planner captures showed a single-column layout, readable sample
content, a resting gauge and visible controls. The reference video does not
show a mobile frame, so these captures establish Fluxora's rendered state rather
than a mobile Relay comparison; screenshots alone do not prove keyboard access
or complete responsive coverage.

Playwright currently reuses existing local web/API servers outside CI. Its local
results depend on those running processes and the configured local database, so
the successful local default gate must not be treated as equivalent to an
isolated CI run without further evidence.
