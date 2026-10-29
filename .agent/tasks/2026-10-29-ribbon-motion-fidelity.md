# Ribbon motion fidelity correction

## Identity
- Base commit: `244103e`
- Branch: `codex/relay-landing-foundation`
- Implementer: Codex

## Target slice IDs
- `L12.3`

## Reopen justification
The owner rejected the prior ribbon's fidelity: sparse still-frame analysis
missed the reference's continuous motion, broad luminous volume and changing
focus. The previous tests proved functionality, not visual similarity. This
revision corrects that specific visual regression; it does not reopen product
features or add another landing page.

## Outcome
Reconstruct the broad, flowing ribbon with an independently advancing intro,
converging/diverging filaments, soft depth, lime/blue light and particles.
Keep the existing accessible fallback and cleanup contracts.

## In scope
- Dense temporal review of the supplied MP4 and its relationship to page scroll.
- Existing ribbon geometry, shader and choreography; no duplicated renderer.
- Recorded local motion preview, visual review, relevant E2E and full verify.
- Correct the documentation's earlier overstatement of visual fidelity.

## Out of scope
- Provider calls, auth/engine changes, pricing, deployment, push or PR.

## Acceptance criteria
- [x] Broad luminous ribbon replaces the narrow, equally spaced wire appearance.
- [x] Intro flow is time-driven; page scroll and idle flow remain distinct.
- [x] Focus, spread, light and particle movement vary continuously without hard seams.
- [x] Text and interactions remain usable across desktop/mobile and reduced motion.
- [x] Recorded motion evidence and full quality gate pass before local commit.

## Verification
`agent:task:check`, visual motion recordings, `e2e/landing.spec.ts`,
`codegraph:generate`, `npm run verify`.
