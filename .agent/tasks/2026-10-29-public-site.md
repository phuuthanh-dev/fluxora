# Task contract

## Identity
- Task ID: `2026-10-29-public-site`
- Base commit: `2e73198`
- Working branch: `codex/public-site-completion`
- Implementer/reviewer: Codex

## Outcome
Complete and release the public website before the next product UI refinement.

## Target slice IDs
- `PUBLIC-READY-1`

## In scope
Public privacy/terms/support pages, contact redirect, footer/login links, metadata, sitemap/robots, branded 404, public social image, tests and documentation. Include the already verified GSAP fix in the release.

## Explicitly out of scope
Provider credential use, database/schema changes, OAuth console submission, new hosting, unrelated backend or deployment configuration.

## Acceptance criteria
- [x] Public pages are readable without sign-in/JavaScript on desktop/mobile, using shared Fluxora branding.
- [x] Privacy content matches code; public contact is owner-approved, no invented SLA/certification/deletion endpoint.
- [x] Crawl/share metadata is correct; private application routes are noindex and excluded from sitemap.
- [x] Local quality gate and PR CI pass; release uses only develop → main and observed deployment/HTTP evidence.

## Required evidence
Public route/link/metadata/keyboard/responsive E2E; visual screenshots; npm run verify; GitHub CI/deploy receipts.

## Safety boundaries
Owner explicitly authorizes publication and release. No new personal data beyond the approved support email. No secrets, real provider calls, database operations or live workflows. Preserve all production volumes and deployment configuration.
