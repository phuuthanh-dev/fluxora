# Paid-plan upgrade and usage clarity

## Identity

- Task ID: `2026-11-13-paid-plan-upgrade`
- Base commit: `eeb1c91`
- Working branch: `develop` (owner's established single remote branch)
- Implementer and reviewer: Codex

## Outcome

Allow a workspace owner to upgrade from an active Starter plan to Pro for the full Pro price after an explicit explanation and confirmation. A confirmed payment starts a new 30-day Pro term and resets the live-run allowance; remaining Starter time is forfeited. Same-plan renewal continues to extend its existing term. Historical usage records are retained and the next scheduled reset remains the start of the UTC month.

## Target slice IDs

- `PLAN-USAGE-1` — owner-directed paid-plan behavior and transparent usage.

## In scope

- Confirmed upgrade, safe checkout and reconciliation, payment disclosures, affected UI and bounded operational qualification.
- Update terms and documentation; reuse existing billing, usage and dialog components.

## Explicitly out of scope

- Downgrades before expiry, automatic renewals or refunds, new connectors, independent backup, real payment or changes to real customer data.

## Acceptance criteria

- [ ] A paid Starter owner can review the full price and forfeiture before checkout, and is upgraded only after verified settlement.
- [ ] Same-plan renewal, concurrent and stale orders, duplicate notifications, upgrade quota reset and ownership remain safe.
- [ ] Paid period and monthly usage dates are comprehensible; affected UI is reviewed visually at desktop/mobile sizes.
- [ ] Audit and final verification pass; open and merge one develop-to-main PR when CI passes.

## Required evidence

- Tests: real database where feasible and provider mocks for upgrade, renewal, replay, conflicts and payment failures.
- Commands: `npm run verify`, relevant migration checks, CI and deployment status.
- UI/manual proof: actual browser review, two themes where applicable, desktop and mobile.

## Safety boundaries

- Preserve existing unrelated changes and production data. Do not initiate real payments or reveal credentials.
- The owner explicitly authorized PR and merge; deployment follows the existing workflow.
