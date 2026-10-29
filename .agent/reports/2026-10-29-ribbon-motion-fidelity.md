# Ribbon motion fidelity correction

## Outcome

- Status: implementation complete locally; owner visual acceptance pending.
- Replaced the narrow-wire approximation with a broad implicit ribbon field,
  time-driven entrance, converging/fanning filaments, blue inner light, soft
  lower-page focus and drifting motes.
- Corrected the earlier overstatement: screenshots and E2E do not establish
  temporal fidelity or equivalence to Relay's original source.

## Commit and scope

- Base: `244103e`; branch: `codex/relay-landing-foundation`.
- Implementation: the commit containing this report.
- Scope respected: yes. Existing landing renderer, regression coverage and docs.
  No new library, provider request, auth/engine change, push, PR or deployment.

## Acceptance criteria

| Criterion | Evidence | Result |
|---|---|---|
| Temporal analysis | Ordered 8 fps sequences; all 313 source frames measured for neutral-text displacement versus lime coverage | complete |
| Autonomous entrance versus scroll | 2.6-second entrance and continuing idle flow; ScrollTrigger remains responsible for page travel | complete |
| Broad volume without folded geometry | Catmull-Rom spine sampled into a 2,048-entry local float field; one quad, 36 filaments, five nearest neighbors per fragment | complete |
| Progressive compatibility | Existing SVG/reduced-motion/context-loss cleanup; missing float filtering also falls back; native scrolling restored on route exit | pass |
| Responsive rendering | Desktop Metal recording and 390px mobile review, no horizontal overflow; software-only DPR reduction preserves DOM sharpness | pass |
| Real moving evidence | Browser recording includes stationary hero entrance and subsequent scroll | complete |
| Fidelity to reference | Improvement implemented and recorded; owner has not accepted an exact match | pending owner review |

## Validation receipts

| Check | Result | Evidence |
|---|---|---|
| Task state check | pass | Explicit L12.3 reopen justification |
| Typecheck | pass | Web TypeScript |
| New motion E2E | pass | Canvas pixels continue changing after intro while scrollY stays zero |
| Initial full gate | 1 failure, corrected | Under software rendering, sample completion exceeded the 5s assertion. Lowered software DPR to 0.5; native-GPU quality is unchanged |
| Focused sample-run retry | pass | Run/stop/replay and no API requests, 1/1 |
| Final `npm run verify` | pass, exit 0 | Harness, Prisma, API 213/213, web 23/23, lint, typecheck, production builds and Chromium E2E 55/55 |
| Native-GPU inspection | no observed JS errors | Apple M3 / ANGLE Metal; short candidate RAF cadence sample about 60Hz, not a universal GPU/frame-rate guarantee |
| `git diff --check` | pass | No whitespace errors |

Final gate log: `/tmp/fluxora-motion-verify-final.log`.
Portable MP4 preview: workspace sibling `../previews/fluxora-ribbon-motion-2026-10-29.mp4`
(16.6 seconds, approximately 3 MB; not a shipped site asset).
Source-analysis scratch: `/tmp/relay-motion-measure.json`.

## Files changed

- `landing-ribbon-geometry.ts`: spine lookup and independently smoothed width.
- `landing-ribbon-shader.ts`: implicit field, entrance, volume and moving light.
- `landing-three-scenes.tsx`: manual camera, texture lifecycle, ready-after-draw,
  retained clock and software-renderer pixel budget.
- `landing-scenes.tsx`: entrance is not replayed on pause/resume.
- `e2e/landing.spec.ts`: idle motion must paint changing pixels.
- Development/design rules, current delivery state, landing contract and video
  analysis updated; task contract and this report added.

## Risks and follow-up

- The reference's source and exact rendering technology remain unverified.
- This field expects a document-descending spine; it is not a general looping
  3D spline renderer.
- Source measurement thresholds are diagnostic, not a recovered shader or
  exact motion curve. Original copy/video/assets are not included at runtime.
- Native Chromium and software Chromium were inspected. Physical iOS/Android
  and Safari/Firefox GPU profiling remain unqualified.
- Visual acceptance remains the owner's judgment after watching the recording
  or interacting with localhost. Functional pass does not substitute for it.
