# Platform administration and connector qualification

## Identity
- Task ID: `2026-11-09-admin-calendar-slack`
- Base commit: `7aa439422e60f577604bd813853418907e24c208`
- Working branch: `develop`; implementer and reviewer: Codex

## Target slice IDs
- `ADMIN-1`
- `CALENDAR-1`
- `OPS-1`

## Outcome and scope
Investigate production Slack OAuth and Calendar polling evidence, implement a small server-enforced instance admin boundary and admin center with operational summaries and practical account administration. Update the approved product and architecture decisions. Preserve tenant data and do not reveal credentials, provider payloads or execution data in admin summaries.

## Explicitly out of scope
Slack secret rotation, unsolicited provider sends, team/project RBAC, destructive user or workflow deletion, feature expansion outside the approved roadmap, intermediate verification or multiple PRs.

## Acceptance criteria
- [ ] Slack production issue and Calendar trigger evidence are reported honestly; fix confirmed in-scope defects.
- [ ] Platform administration is inaccessible without server-side authorization; safe account management is audited.
- [ ] Admin UI presents users, workspaces, workflows, executions, audit and health without credential values.
- [ ] Record tests, final verify, one develop-to-main PR and merge outcome.

## Required evidence and safety
Use only authorized provider resources; keep local scheduler disabled. Preserve data and do not print secrets. Update the code graph when imports change.
