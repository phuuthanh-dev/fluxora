# Task contract

## Identity
- Task ID: `2026-11-01-google-calendar`
- Base commit: `406bcb6`
- Working branch: `codex/gmail-connector`
- Implementer: Codex
- Reviewer: user

## Outcome
Connect a Google Calendar account and read upcoming events from a workflow.

## Target slice IDs
- `CALENDAR-1`

## In scope
- Independently scoped OAuth, protected credential, guided action and mock/live adapter.

## Explicitly out of scope
- Production changes, real calendar access, event modification.

## Acceptance criteria
- [ ] Calendar credentials are workspace scoped and do not alter existing Google credentials.
- [ ] Users can list upcoming events using a scoped calendar connection.
- [ ] Mock runs are synthetic and provider errors do not expose tokens.

## Required evidence
- Tests to add or update: OAuth, adapter, guided configuration.
- Commands to run: task check, typecheck and final verify.
- UI/manual proof: connection and action fields without real credentials.
