# Task contract

## Identity
- Task ID: `2026-11-09-dashboard-admin-merge`
- Base commit: `2de44e5`
- Working branch: `develop` (existing canonical checkout; only develop is pushed)
- Implementer: Codex, direct implementation
- Reviewer: Codex diff review and CI

## Outcome
One owner-approved batch: readable dashboard, contextual Admin investigation, bounded two-input Append Merge, and honest Slack/Calendar qualification evidence; one release PR.

## Target slice IDs
- `DASHBOARD-UX-2`
- `ADMIN-1`
- `MERGE-1`
- `APP-EXPANSION-1`
- `CALENDAR-1`

## In scope
- Dashboard spacing, headings, status colors and factual 24h activity visualization using shared landing-derived tokens.
- Read-only admin filters and navigation user/workspace/workflow/execution; audit actor/date/target identifiers without private payloads.
- Exactly two ordered Merge inputs and Append output; graph, runtime, item provenance, editor and bounded failure/resume checks.
- Check existing Slack and Calendar qualification boundaries. Slack live remains deferred; Calendar only labelled temporary test resources if available.
- Final audit, isolated full verify, include local Admin menu fix in develop→main PR, merge passing CI and follow deployment.

## Explicitly out of scope
- No new apps, dependencies, Merge modes/loops, impersonation/RBAC, secret rotation or unrelated cleanup.
- No Slack scope/Events URL changes or real Slack event tests while deferred.
- No modifications to business workflows or unknown records/volumes.

## Acceptance criteria
- [x] Dashboard light/dark headings, controls, states and visualization are legible and spaced; execution center remains collapsed by default.
- [x] Admin links preserve context in bounded authenticated metadata queries; audit filters combine and paginate; no payload leakage or workspace-auth bypass.
- [x] Merge waits for both inputs, concatenates in input order, handles empty/skipped branches, stops on unhandled failure, preserves limits and safe resume.
- [x] Editor exposes two labelled input handles and appropriate setup and validation, without V1/V2 variants.
- [x] Provider evidence distinguishes implemented from real-tested; explicit deferrals retained.
- [ ] Full final quality gate and CI pass before one PR merge; actual deploy result recorded.

## Required evidence
- Tests to add or update: existing Admin controller/integration/E2E; dashboard regression; Merge graph/runtime/approval-resume and editor scenario.
- Commands to run at end: codegraph generation, npm run verify in isolated test services, diff/security audit.
- UI/manual proof: dashboard/Admin/editor in both themes, screenshots with synthetic fixtures.

## Safety boundaries
- Keep local web/API available, scheduler disabled; no full-secret logs/fixtures or provider calls in tests.
- Provider writes only to previously approved or specifically labelled test resources, no Slack scope changes.
- Merge/release authorized by current user request; data deletion not authorized.
