# Workspace activity overview

## Identity

- Task ID: `2026-11-01-workspace-activity-overview`
- Base commit: `d92d130c8bdee1e3e495f111aa78be3a46612328`
- Working branch: `codex/workspace-activity-overview`
- Implementer: Codex; reviewer: independent diff and tests.

## Target slice IDs

- `L6.11`

## Reopen justification

The owner requested dashboard activity metrics. Existing status counts cover
only the currently loaded execution pages, so they cannot summarize workspace
activity or show failed runs outside the loaded page.

## Outcome

Show accurate recent workspace activity without exposing execution payloads.

## In scope

- Owner-authorized aggregated counts of runs created in the past 24 hours.
- Dashboard summary with explicit time/mode scope, loading and error states.
- Distinguish counts in the paginated list from workspace-wide counts.
- Mocked and isolated integration tests and relevant documentation.

## Explicitly out of scope

- New connector runtime, provider calls, migrations, production changes,
  tracking, live streams, and historical analytics.

## Acceptance criteria

- [x] Summary includes only the selected workspace's retained executions from
      the last 24 hours, including both test and live runs.
- [x] Owners can distinguish failed, in-progress and successful totals; other
      statuses remain represented in total runs.
- [x] Stale requests cannot overwrite data after workspace changes.
- [x] UI handles loading, empty and error states accessibly in both themes.
- [x] Existing execution list filters remain explicitly scoped to loaded runs.

## Required evidence

- Owner/scoping/time-window aggregation tests and browser coverage.
- `npm run verify` with isolated local infrastructure.
