# Task contract

## Identity
- Task ID: `2026-11-18-shopify-privacy-fix`
- Base commit: `b37d5787db0a06287640c19772110f01433a7581`
- Working branch: `develop`
- Implementer: Codex
- Reviewer: Codex

## Outcome
Accept the valid signed Shopify customer data request observed from a development store without weakening authentication.

## Target slice IDs
- `APP-EXPANSION-1`

## In scope
- Correct customer-data payload validation for the observed optional fields.
- Cover signed deliveries, invalid signatures and malformed values in focused tests.
- Record real production OAuth and webhook qualification evidence.

## Explicitly out of scope
- Other providers, customer-facing copy, public app review and unrelated local changes.

## Acceptance criteria
- [x] Authenticated customer-data requests with absent request metadata and null or missing order lists are recorded once.
- [x] Invalid signatures and malformed non-null field values remain rejected.
- [x] Production OAuth and signed Shopify event status are reported accurately.

## Required evidence
- Commands: `npm run agent:task:check -- .agent/tasks/2026-11-18-shopify-privacy-fix.md`, focused tests, typecheck and release verification.
- Provider proof: authorized development-store OAuth and signed data-request event.

## Safety boundaries
- Preserve secrets, existing connections, existing pending requests and unrelated edits; do not claim review approval or independent merchant testing.
