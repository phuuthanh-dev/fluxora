# Task contract

## Identity
- Task ID: `2026-11-01-google-calendar`
- Base commit: `406bcb6`
- Working branch: `codex/gmail-connector`
- Implementer: Codex
- Reviewer: user

## Outcome
Connect a Google Calendar account and manage events and availability from a workflow.

## Target slice IDs
- `CALENDAR-1`

## In scope
- Independently scoped OAuth, protected credential, calendar/event pickers, event actions and mock/live adapters.

## Explicitly out of scope
- Production changes and real calendar access without an owner-approved test resource.

## Acceptance criteria
- [x] Calendar credentials are workspace scoped and do not alter existing Google credentials.
- [x] Users can list, get, create, update and delete events and check availability using a scoped calendar connection.
- [x] Retries use stable event IDs within one execution; invitation and deletion effects are explicit.
- [x] Mock runs are synthetic and provider errors do not expose tokens.

## Required evidence
- Tests to add or update: OAuth, adapter, guided configuration.
- Commands to run: task check, typecheck and final verify.
- UI/manual proof: connection and action fields without real credentials.
