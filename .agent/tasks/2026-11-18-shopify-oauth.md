# Task contract

## Identity
- Task ID: `2026-11-18-shopify-oauth`
- Base commit: `dfbff5b244ce96bf672c81fb0966c6545936e6d6`
- Working branch: `codex/shopify-oauth-distribution-20261118`
- Implementer: Codex
- Reviewer: Codex

## Outcome
Safely qualify Shopify webhooks and enable public multi-store OAuth without duplicating existing features.

## Target slice IDs
- `APP-EXPANSION-1`

## In scope
- Shopify response and webhook qualification, per-store OAuth, required privacy handling and public distribution readiness.
- Direct UI audit, one final verification and one develop-to-main PR and merge.

## Explicitly out of scope
- Unrelated connectors, customer-facing copy without owner approval, existing Shopify webhooks and unrelated local changes.

## Acceptance criteria
- [x] Shopify webhook verifies signatures and responds consistently; a real order event was scoped to the approved test store and the temporary webhook was removed.
- [x] OAuth credentials remain scoped to their store and workspace and refresh is serialized; the test store successfully refreshed its token.
- [ ] Required privacy subscriptions still need deployment and an end-to-end operator process; the local queue does not itself erase data or notify merchants.
- [x] UI was inspected directly in light and dark on desktop and mobile; verification records remaining limits.

Public multi-store availability is pending Shopify review, protected-data approval,
production configuration, privacy operations and an independent-store test.

## Required evidence
- Tests to add or update: webhook HTTP, OAuth boundaries and privacy handling.
- Commands to run: codegraph generation, final verify and CI.
- UI/manual proof: desktop/mobile interaction in both themes.

## Safety boundaries
- No modification of existing real-store webhooks or secret rotation, provider account changes only when permitted, keep local unrelated changes.
