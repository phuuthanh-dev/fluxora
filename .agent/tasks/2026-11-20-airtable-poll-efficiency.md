# Task contract

## Identity

- Task ID: `2026-11-20-airtable-poll-efficiency`
- Base commit: `bde8c8146f2f00b72b600a353d3ab3c1ef4ffc94`
- Working branch: `codex/airtable-poll-efficiency`
- Implementer: Codex
- Reviewer: PR quality gate and owner

## Outcome

Reduce Airtable polling API calls and enable lower-frequency checks without weakening safe recovery or existing workflows.

## Target slice IDs

- `APP-EXPANSION-1`
- `EDITOR-QUALIFICATION-1`

## In scope

- Compare current n8n and Airtable documentation, reuse existing polling machinery and preserve checkpoints.
- Resolve and retain field metadata safely to avoid querying it at every poll; handle metadata changes and provider failures.
- Add slower Airtable-only intervals, test real authorized sample data, audit the affected UI visually.

## Explicitly out of scope

- Other integrations, new payment features, unrelated UI changes, customer data, and unapproved product copy.

## Acceptance criteria

- [x] Common Airtable polling uses one request per page with bounded metadata refresh and safe checkpoint behavior.
- [x] Existing checkpoints and published graphs continue working; new slower intervals validate and schedule.
- [x] Meaningful provider, migration, failure and scheduler tests pass; desktop/mobile light/dark UI inspected directly.
- Real Airtable test results and limitations are reported; PR and merge follow CI success.

## Required evidence

- Targeted unit/integration tests, typecheck and relevant browser checks; `agent:state`, `agent:task:check`, codegraph if imports change.
- Real provider verification limited to the previously authorized test base and sample records.

## Safety boundaries

- Preserve unrelated user changes, credentials, production data and payment settings.
- Only task-owned local resources may be cleaned up; do not remove user data or rotate credentials.
