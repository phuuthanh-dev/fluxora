# Task contract

## Identity
- Task ID: `2026-11-18-shopify-qualification`
- Base commit: `e0b3397`
- Working branch: `develop`
- Implementer: Codex
- Reviewer: Codex

## Outcome
Qualify the existing Shopify integration with an authorized development store and document the limits of that evidence.

## Target slice IDs
- `APP-EXPANSION-1`

## In scope
- Verify Shopify OAuth reads and the signed order-created event using sample data.
- Review the Shopify editor and connection UI on desktop and mobile.
- Record remaining Shopify review and data-protection requirements.

## Explicitly out of scope
- App Store payment, real merchant data, new Shopify operations and unrelated local changes.

## Acceptance criteria
- [x] Existing order and product reads succeed with the authorized development store.
- [x] A real sample order reaches the production trigger; the temporary webhook is removed and test workflow deactivated.
- [x] UI and remaining provider-review limitations are reported without claiming public readiness.

## Required evidence
- Commands: `npm run agent:task:check -- .agent/tasks/2026-11-18-shopify-qualification.md`, focused Shopify tests and `git diff --check`.
- Provider proof: production OAuth reads and Shopify-signed order creation in a development store.

## Safety boundaries
- Preserve existing store data, secrets, privacy requests, other workflows and unrelated worktree changes.
