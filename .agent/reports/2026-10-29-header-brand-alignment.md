# Header brand alignment

- Status: complete locally.
- Base: `ece0f28`; local branch: `codex/header-brand-alignment`.
- Scope: shared BrandLockup CSS only; no changes to navigation, fonts, assets, dependencies or APIs.
- Diagnosis: Chrome measured a 28.5px logo center inside a 64px auth header, caused by inline baseline space.
- Fix: block flex lockup, unit line-height, block SVG and a 2px optical adjustment for the Gilroy wordmark.
- Native post-fix geometry: auth/register 31.5px logo center inside 63px content plus 1px header border; landing center exactly 44px (64px header at y=12); public support center 39.5px inside 79px content plus border. Header heights unchanged.
- Both light/dark cropped previews reviewed at `../previews/header-alignment-2026-10-29/`.
- Existing UI matrix and full `npm run verify`: pass (exit 0): 213 API / 23 web / 82 E2E, build, typecheck, lint, harness and security checks; log `/tmp/fluxora-header-alignment-verify.log`.
- `git diff --check`: pass. No additional test file for this CSS-only adjustment.
- Delivery: local commit and local develop integration only; no push/PR/deployment.
