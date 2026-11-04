# Task contract

## Identity
- Task ID: `2026-11-04-supabase-insert`
- Base commit: `be29be5df4199cf3b334d1241d65ad6082388aaf`
- Working branch: `develop`
- Implementer/reviewer: Codex

## Outcome
Add an independently discoverable Supabase action that inserts one row with guided fields and a workspace-owned connection.

## Target slice IDs
- `APP-EXPANSION-1`

## In scope
- Select a table and build one bounded row with typed fields, retaining a manual entry fallback.
- Use the Supabase Data API with effective connection identity and no automatic retry of uncertain writes.
- Test validation, credential scope, mock execution, transport, ambiguous errors and editor configuration.

## Explicitly out of scope
- Bulk writes, upsert, update/delete, arbitrary SQL, live provider calls and extra privileges.

## Acceptance criteria
- [x] Insert one row without requiring JSON input and keep existing select workflows unchanged.
- [x] Fail closed on invalid input before credential access, block redirect replay and report uncertain outcomes without retry.
- [x] Preserve access restrictions and avoid storing API keys or provider error bodies in output.

## Required evidence
- Focused runtime, catalog and live-readiness tests passed; 16 relational-selection E2E tests passed with synthetic provider responses. Full verification remains at the end of the current goal batch.

## Safety boundaries
- No real credentials, remote writes, production modifications or new provider scopes.
