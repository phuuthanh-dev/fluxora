# Task contract

## Identity
- Task ID: `2026-11-04-credential-steam`
- Base commit: `4c401c8901dfd8c4b5795b7d35ec248bc8b71459`
- Working branch: `develop`
- Implementer/reviewer: Codex

## Outcome
Prevent concurrent credential deletion from silently invalidating workflow edits or live retries; investigate Steam expansion and correct confirmed account snapshot defects without changing existing node types.

## Target slice IDs
- `EDITOR-QUALIFICATION-1`
- `APP-EXPANSION-1`

## In scope
- Coordinate reference mutation, deletion and execution acceptance; preserve existing workflows and make stale credential references actionable.
- Regression coverage with real concurrent PostgreSQL transactions, and Steam snapshot fixtures.
- Research Steam operations against Valve documentation; no new unsupported integration promises.

## Explicitly out of scope
- New providers, migrations unless necessary, live external actions, credentials, cross-workspace coordination, automatic reassignment or deletion of workflows.

## Acceptance criteria
- [ ] A deletion racing a reference write or live retry cannot silently leave a live run pointing at a deleted connection.
- [ ] Existing referenced credentials remain protected and unrelated workflows remain usable.
- [ ] Steam current-game data handles the actual API response while retaining existing output types.
- [ ] Run focused tests then `npm run verify` on the final changes.

## Required evidence
- PostgreSQL concurrent race tests; existing credential, workflow and execution tests; Steam unit fixtures; full quality gate.

## Safety boundaries
- No real provider credentials, live calls or external side effects in tests.
- Keep scheduler local disabled. Preserve user work and unrelated changes.
