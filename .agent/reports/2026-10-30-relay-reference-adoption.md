# L12.3 — official Relay reference adoption

## Outcome
Status: complete locally. The newly supplied Relay specification replaces
video-only inference for landing typography, palette, stream shaders and selected
vendor artwork. This is a new owner-approved reopening, not repeated work.

## Commit and scope
- Base: `eae6b6ee375a54ff80736e99d4a294c49842e45d` (local ACCOUNT-1 preserved).
- Work: local `codex/relay-reference-adoption`, intended for local `develop`.
- No remote push, PR, deploy, production database or provider calls.
- Original email/document/full 83-asset bundle remain outside tracked source.

## Acceptance criteria
- Three locally bundled marketing fonts and official #c8f751 lime. Product Gilroy is unchanged.
- 12 original decorative assets (428,910 bytes), exact sources/hashes in the public manifest. No CDN runtime dependency.
- A private ten-section comparison board and all 83 assets at `../relay-reference/`.
- Seeded particle/filament geometry, float spline texture, perspective camera and bounded bloom, owned by one GSAP/Lenis ticker.
- Existing FAQ field morph and statement handoff retained. Tests inspect allocations, shader clock and absolute scroll continuity.
- Docker runtime now includes `public`; local standalone HTTP smoke verified the landing and every asset hash.

## Validation receipts
- Focused initial landing checks: 17 passed, two failures. The palette expectation was stale after the intentional black background change; the second was a slow 1440px software-rendering timeout. Both passed in the focused rerun. Software drawing is explicitly budgeted, without user-agent/test bypasses.
- Deployment contract: 14 tests passed, including public-artwork packaging.
- First full gate: API 226, web 23 and build passed; E2E 84/87. Two WebGL-active interactions stalled; both passed in the targeted rerun. The third exposed a faulty probe assumption: Three.js caches unchanged uniforms, so the scroll baseline must be captured before arming. That measurement is corrected without relaxing the scroll/geometry assertions.
- Lifecycle review found contexts were disposed but not explicitly lost. Each effect now creates its own canvas (safe through React Strict Mode replay) and explicitly releases the WebGL context. The obsolete R3F dependency was removed.
- Final focused visual/lifecycle checks: 5/5, with videos and 375/768/1440 screenshots. FAQ reflow created 0 textures, 0 buffers, 0 programs, removed 0 wheel listeners; scroll stayed at 8506px and the largest morph step was 14.53 of 63.27px total.
- Second full gate: 85/87 E2E; existing multi-navigation dashboard lifecycle exceeded its aggregate 30-second test budget, and cold software shader startup exceeded a 5-second readiness wait. Traces show startup/aggregate timeout, not a failed behavioral assertion. The full dashboard scenario now has 60 seconds; only the ribbon startup wait has 15 seconds. Per-action, scroll-stability, allocation and morph-step assertions remain unchanged. These explicit harness budget changes are part of this diff.
- Final full verify: passed — API 226/226, web 23/23 and Playwright 93/93.
- Visual evidence: `../relay-reference/evidence/final-visual/`; first gate diagnostics retained separately. Desktop hero/FAQ/runtime/footer and mobile footer were visually inspected.

## Files changed
- Marketing typography/CSS, selected original artwork and provenance manifest.
- Three.js particle/filament shaders, stable curve texture and owned renderer lifecycle.
- Landing asset/readability/fallback/FAQ lifecycle E2E; two explicit test wait budgets.
- Web Docker public-directory packaging and its deployment contract test.
- Font dependencies, obsolete R3F removal, code graph and design/state/task documentation.

## Risks and follow-up
The private board is not a runnable vendor project or pixel-perfect clone.
Fluxora retains its brand, real integrations, truthful sample copy and existing
FAQ/handoff behavior. The supplier's spring runtime is adapted to the existing
GSAP ownership instead of adding another animation engine. Headless tests do not
establish hardware 60 FPS or owner visual acceptance. No new remote Docker build
or production deployment was performed. Vendor artwork is not separately
relicensed by this change.
