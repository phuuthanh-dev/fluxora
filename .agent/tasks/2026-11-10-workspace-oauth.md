# Task contract

## Identity
- Task ID: `2026-11-10-workspace-oauth`
- Base commit: `3fd0f0d8e2579b48399b807b989960a7445e4cc4`
- Working branch: `develop`; one new PR to main for OAuth (UI PR #116 merged during this batch).
- Implementer/reviewer: Codex, direct implementation and final review.

## Outcome
Complete the approved UI/release, Slack distribution, Google review follow-up and Notion OAuth batch. Each user connects their own account; no new node versions or execution engine.

## Target slice IDs
- `APP-EXPANSION-1`

## In scope
- Preserve completed UI changes; add matching OAuth controls.
- Shared signed Slack event ingress routed to matching active workspace credentials and registrations; retain existing deduplication/recovery.
- Notion OAuth with manual tokens retained, owner-bound single-use state and safe token lifecycle.
- Inspect provider consoles and configure supported production distribution after code is ready; record external approval blockers accurately.

## Explicitly out of scope
- Marketplace promises, new connectors, engine redesign, Slack secret rotation, destructive cleanup, changing Google scopes or repeating its submission.

## Acceptance criteria
- [x] Slack events cannot cross unrelated app/team/workspace credentials; duplicate delivery does not repeat a run.
- [x] Notion OAuth preserves workspace ownership, reconnect identity and vault-only tokens.
- [x] Existing manual Notion connections remain usable.
- [x] Google review status and external launch prerequisites are documented from current evidence.
- [ ] One final audit/verify; create one OAuth PR and merge after passing CI.

## Required evidence
- Synthetic isolation, callback and token lifecycle tests; UI coverage and final npm run verify.
- Provider setup is separate from proof of multi-tenant live qualification.

## Safety boundaries
- Preserve data and preexisting next-env diff. Local web/API stay available with scheduler disabled.
- Owner authorized PR and merge. No raw secrets in output, Git or fixtures; no unsolicited real-provider messages.
