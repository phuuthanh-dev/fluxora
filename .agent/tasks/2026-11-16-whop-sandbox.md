# Task contract

## Identity
- Task ID: `2026-11-16-whop-sandbox`
- Base commit: `f4ff43b903b9f6af83f3cb90c6cb5471912a459b`
- Working branch: `develop` (local batch, owner-requested develop to main PR)
- Implementer and reviewer: Codex

## Outcome
Add Whop card checkout, verified webhook, reconciliation and existing plan entitlement handling; prepare production at the owner's request.

## Target slice IDs
- `PLAN-USAGE-1`

## In scope
- Whop integration and payment correlation, duplicate and refund review, and production preparation.
- Preserve existing bank and Lemon behavior and existing workspace state.

## Explicitly out of scope
- Changing customer-facing marketing copy. Production activation is pending actual fees, tax and release checks.

## Acceptance criteria
- Sandbox payment verifies account, configuration, amount, currency and metadata before granting exactly one plan term.
- Valid duplicate, unmatched, refund, delayed and failed provider events remain safe and reconcilable.
- Existing payOS and Lemon flows remain intact; full verification and CI pass before merge unless the owner explicitly changes the verification requirement.

## Required evidence
- Isolated integration tests and, when possible, real Sandbox webhook delivery.
- Run `npm run verify` only after implementation/audit.
