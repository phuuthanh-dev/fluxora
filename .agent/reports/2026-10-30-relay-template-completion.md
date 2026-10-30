# L12.3 — Relay template completion

## Outcome
Implementation and local verification complete. The owner-requested
intro, glass workflow board, square-first logo fold, frosted section backgrounds,
run planner and two-panel footer are adapted from the supplied reference with
Fluxora content and identity. This report extends the initial reference-adoption
report; it does not reopen already completed account or connector work.

## Commit and scope
- Base: `eae6b6ee375a54ff80736e99d4a294c49842e45d`.
- Local `codex/relay-reference-adoption` → local `develop` after verification.
- No push, PR, deployment, production-data changes or external provider calls.
- Original paid document, email and full downloaded asset set remain private.

## Acceptance criteria
- Bounded real-readiness ring → flood → fold intro; keyboard skip, asset failure,
  reduced motion, no-JS and overflow/inert restoration.
- Four-node hero with staged boot, branching SVG packets, illustrative run feed,
  offscreen pause and a local sample runner.
- Square-first open/collapse and measured reversible docking at desktop/mobile.
- Original artwork, viewport-bounded frosted slab and readable glass panels.
- Native keyboard run slider, rolling figures, three honest planning profiles;
  no invented commercial plans or capacity guarantees.
- 24 original assets (589,396 bytes), local fonts and one owned WebGL/ticker.

## Validation receipts
- Initial expanded focused suite: 9/15. It exposed an outdated linear-collapse
  assertion, full-page blur rendering overhead and new probe/readiness races.
  The shell now has square-phase assertions; backdrop raster is bounded to 100svh.
  Probe observers attach to `document` before parsing, and offscreen checks wait
  for the actual observer state. Decorative ports are excluded from text-overflow
  measurements. Behavioral assertions remain, with no visual/test-mode bypass.
- Second focused suite: 9/11; remaining two new test instrumentation issues fixed.
- Targeted recovery: 2/2 (intro phases/release, packets/offscreen/alternate route).
- Focused combined coverage: all 11 scenarios passed across the latter runs,
  including desktop/mobile docking, resize/reload/pause, no-JS, 375/768/1440px
  board/planner/footer, asset failure, and stable GPU/scroll resource lifecycle.
- Third pre-expansion full gate was 84/87 E2E, despite passing API/web/build.
  The editor onboarding journey now has a 60s aggregate budget (many operations,
  unchanged per-assertion deadline), and cold scene readiness has 15s. A real
  software-renderer morph-step failure led to a smaller software rendering tier,
  not a relaxed morph assertion; the focused lifecycle check now passes.
- First expanded full gate: API 226/226, web 23/23, build passed; E2E 89/93.
  Three existing long journeys exceeded their time/navigation budgets (account,
  credential and notifications), and the keyboard tab test focused the inert
  page before intro completion. Account navigation now has 15s after the successful
  mutation; credential/notification journeys have 60s total. Per-action auth/data
  assertions remain unchanged. Keyboard tests wait for the interactive boundary.
- Recovery: all four failed scenarios plus a recorded intro phase check passed
  (5/5 in 29.7s). No application/auth/credential behavior changed for these fixes.
- Second expanded full gate: API 226/226, web 23/23, build passed; E2E 92/93.
  The single failure was the idle-ribbon test's legacy 5s startup wait, which
  included the new bounded intro plus lazy software shader startup. The trace
  failed before pixel-motion assertions. It now observes intro release explicitly
  and gives shader startup the same 15s budget as the other renderer checks.
  Intro/boot waits use 8s to cover the documented 6s fail-open bound, rather
  than the previous 5s assertion default;
  pixel differences, idle scroll and context-loss behavior remain asserted.
  The template screenshots now also write named local files, so the list reporter
  does not discard in-memory attachments. No application code changed after the
  first expanded full gate.
- Final `npm run verify`: passed. Harness/state/code graph, security and release
  checks, Prisma validation/generation, API 226/226, web 23/23, builds, and
  Playwright 93/93 passed in 13.9 minutes. The final runner also proved the
  active ribbon stays animated at rest and morphs existing GPU data after the
  FAQ reflow without restarting scroll.
- Post-gate confirmation: workspaces typecheck passed and the eight affected
  intro/WebGL/packet/responsive scenarios passed with recording enabled. Named
  375/768/1440 board, run-planner and footer screenshots plus the intro video
  are retained privately under `../relay-reference/evidence/template-final/`.

## Files changed
Marketing intro/demo/fold/footer/run-meter/motion/scene/CSS, local vendor assets
and manifest, fonts, obsolete R3F dependency removal, public-directory Docker
packaging and contract test, browser regressions, design and state documentation.
Old time-calculator/CTA styles were removed rather than left as competing UI.

## Risks and follow-up
No production release or sustained hardware 60 FPS claim. The source is a
reconstruction specification, not a runnable vendor repository. Copy, provider
icons and the Fluxora mark are intentional adaptations. Original artwork is not
relicensed as a standalone asset library. Owner visual acceptance remains
separate from automated verification; provider integrations remain unchanged.
