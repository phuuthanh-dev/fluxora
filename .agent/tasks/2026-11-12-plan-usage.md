# Plan and usage: phase one

## Identity

- Task ID: `2026-11-12-plan-usage`
- Base commit: `65e55d8493c3e6872a9ff4a4931ca99db671f48a`
- Working branch: `develop`
- Implementer/reviewer: Codex

## Outcome

Provide honest, observational workspace plan and usage information with owner-approved provisional prices and admin-controlled temporary trial assignments.

## Target slice IDs

- `PLAN-USAGE-1`

## In scope

- Shared Free/Starter/Pro trial catalog and transparent benefits, with no paid access.
- Workspace owner usage and authenticated, audited platform-admin trial assignment.
- Readable product/admin UI, documentation, visual review and final quality gate.

## Explicitly out of scope

- Payment collection, checkout, hard limits, workflow interruption, automatic charging, team roles and independent backup.
- Claiming a retained-execution count is a complete usage ledger or billing-ready meter.

## Acceptance criteria

- [x] Owner sees workspace plan, measured live usage and retention limits, with accessible light/dark UI.
- [x] Admin can inspect and change a temporary trial safely with authenticated and audited requests.
- [x] All pricing and proposed limits are clearly provisional and unenforced.
- [x] Existing live execution and historical data remain unaffected; authorization and boundary cases have meaningful tests.
- [x] Real UI reviewed in both themes; final `npm run verify` passed against an isolated local database on 2026-11-12 (1,229 backend tests, 254 E2E tests).

## Safety boundaries

Preserve uncommitted and production data, do not access real provider secrets, use isolated test data and the existing develop-to-main release workflow.
