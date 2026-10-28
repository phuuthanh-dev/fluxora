# Landing art direction and scroll ribbon report

## Outcome

- Status: complete locally.
- Reopened L12.3 under an explicit changed visual requirement. The landing now
  follows the supplied Relay video and owner-approved technical brief with
  original Fluxora code, a local interactive workflow sample, a continuous
  procedural light ribbon and the previously missing section types.

## Commit and scope

- Base commit: `5842b77`.
- Branch: `codex/relay-landing-foundation`.
- Implementation commit: the commit containing this report.
- Scope respected: yes. Public marketing UI, its npm dependencies, tests and
  documentation only. No provider requests, credentials, engine changes,
  database migration, push, PR or deployment.

## Acceptance criteria

| Criterion | Evidence | Status |
|---|---|---|
| Cohesive desktop/tablet/mobile composition | Inspected 1440×1000, 768×1024 and 390×844 captures; E2E also covers 375px | pass |
| Working local sample without API effects | Run/stop/replay, immediate reduced-motion result, request assertions | pass |
| Real procedural scroll ribbon | Catmull-Rom geometry, local Perlin vertex/fragment GLSL, 24 filaments, travelling light and analytic glow | pass |
| Scroll and renderer ownership | Shared GSAP ticker drives Lenis and manual R3F; ScrollTrigger scrubs camera; pause/context loss/reduced motion/route exit remove scene and Lenis | pass |
| Missing visual sections | Lime fold plate, connection/runtime architecture, selectable sample weekdays, completion gauge, approval/feed and workflow cases | pass |
| Accessible fallback paths | Keyboard tabs, native FAQ/menu, no-JS content, SVG no-WebGL fallback, narrow overflow tests | pass |
| Honest product claims | Removed unsupported success rate; sample data and calculator assumptions identified; no fabricated prices/testimonials | pass |
| Maintainable source and current docs | Split geometry/shaders/lifecycle from UI, moved marketing CSS out of globals, regenerated code graph, superseded old island-only boundary | pass |

## Validation receipts

| Command/check | Result | Relevant output or artifact |
|---|---|---|
| `npm run agent:task:check -- .agent/tasks/2026-10-29-landing-art-direction.md` | pass | Explicit L12.3 reopen justification |
| `npm run codegraph:generate` | pass | Current marketing imports in docs/11-code-graph.json |
| Focused landing E2E | initial selector failure corrected | Sign-in exists in both header/footer; selector now targets header, then passes in full gate |
| `npm run verify` | pass, exit 0 | Harness, secret scan, deployment/release contracts, Prisma validation/generation, API 213/213, web 23/23, lint, typecheck, API/Next production builds, Chromium E2E 54/54 |
| Browser visual and console check | pass | Hero, narrative, statement, reliability, daily activity, calculator, mobile/tablet; no JS/console errors observed in this inspection |
| `git diff --check` | pass | No whitespace errors |

Verification log: local `/tmp/fluxora-landing-verify.log`.
Local visual captures: `/tmp/fluxora-spline-final-{hero,tablet,mobile,narrative,statement,reliability,daily,usage}.png`.
These are development evidence, not shipped assets or permanent CI artifacts.

## Files changed

- `apps/web/src/features/marketing/landing-page.tsx`: server composition.
- `landing-demo.tsx`, `landing-showcase.tsx`, `landing-sections.tsx`,
  `landing-interactions.tsx`, `landing-motion.tsx`: presentation and local interactions.
- `landing-scenes.tsx`, `landing-three-scenes.tsx`,
  `landing-ribbon-geometry.ts`, `landing-ribbon-shader.ts`: procedural assets,
  capability/fallback controls, scroll ownership and cleanup.
- `landing.css` and `apps/web/src/app/globals.css`: scoped marketing styles
  replace the superseded global landing rules.
- `apps/web/package.json`, `package-lock.json`: GSAP and Lenis via npm.
- `e2e/landing.spec.ts`: 13 landing tests.
- `docs/05-implementation-plan.md`, `06-loop-engineering.md`,
  `11-code-graph.json`, `14-design-system.md`, `19-agent-state.md`,
  `22-public-landing-v2.md`, `23-relay-video-analysis.md`: current decisions,
  evidence and original-reference boundaries.
- Task contract and this report.

## Risks and follow-up

- Local completion is not production deployment. No PR, merge or push is implied.
- A rendered MP4 cannot establish Relay's exact source or shader pipeline.
  This implements the requested technique and observed choreography, not a
  claim of pixel identity or possession of the original source.
- Glow is analytical GLSL; no full-screen post-processing bloom dependency.
  Geometry is capped at 6,144 segments, DPR at 1.25, with one ribbon draw call.
- Full regression coverage is Chromium. Real-device Safari/Firefox and
  low-end GPU profiling remain useful before making universal frame-rate claims.
- The activity view is illustrative marketing UI, not a new analytics endpoint.
  The time meter is an estimate, not approved commercial pricing.
