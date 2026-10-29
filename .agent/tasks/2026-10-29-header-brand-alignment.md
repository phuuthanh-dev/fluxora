# Task contract

## Identity
- Task ID: `2026-10-29-header-brand-alignment`
- Base commit: `ece0f28ca3adf594e27c4a0e646ae029eaca2353`
- Working branch: `codex/header-brand-alignment`
- Implementer/reviewer: Codex

## Outcome
Center the shared Fluxora mark and wordmark vertically in header navigation.

## Target slice IDs
- `L13.1`

## Reopen justification
The owner supplied a cropped header screenshot after auth-control-polish. Native Chrome geometry on /login confirms the mark center at 28.5px versus the 32px header center: the inline-flex lockup contributes baseline/descent space inside its link. This is a specific visual regression, not another redesign.

## In scope
Shared brand CSS alignment and typography rhythm; local visual verification on landing/auth/public/product headers and documentation.

## Explicitly out of scope
Header height, navigation behavior, logo assets, font replacement, auth/API, new animation or production release.

## Acceptance criteria
- [x] Mark box is vertically centered in its header without moving the entire navigation.
- [x] Wordmark is optically aligned with the mark in both themes; no clipping or changed header height.
- [x] Existing UI checks and npm run verify pass; local commit integrated into develop only.

## Required evidence
Native browser geometry and cropped header previews. Existing UI matrix/full gate; no new test file for a small CSS adjustment.

## Safety boundaries
No real credential reads, provider calls, push, PR or deployment. Keep the shared BrandLockup and existing font/assets.
