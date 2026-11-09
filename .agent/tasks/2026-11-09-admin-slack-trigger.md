# Admin area and Slack Trigger

## Identity
- Task ID: `2026-11-09-admin-slack-trigger`
- Base commit: `a9e74f9d076a2a04d769715b05118a43b4113fb9`
- Working branch: `develop`; implementer and reviewer: Codex

## Target slice IDs
- `ADMIN-1`
- `APP-EXPANSION-1`
- `CALENDAR-1`
- `EDITOR-QUALIFICATION-1`

## Outcome and scope
Owner approved roadmap 1–4 on November 9. Prioritize Slack message/mention events using existing signed webhook registration and durable execution acceptance. Separate global Admin navigation from workspace navigation, retaining landing-derived shared tokens and controls. Correct evidenced filtering, state and action UX gaps. Qualify Calendar/Slack and improve existing execution investigation and mapping without rebuilding released capabilities. Investigate Merge semantics before proposing implementation.

## Reopen justification
PR #111 released Admin backend and initial UI. Visual audit confirmed misleading workspace selector for global data, repeated user actions, missing empty states and execution filters. Slack sending already exists; this task adds event receiving only.

## Explicitly out of scope
New UI libraries, global RBAC framework, deleting unknown data, Slack secret rotation, other proposed new apps, unapproved provider scopes or sends, arbitrary engine refactors. Preserve immutable published graphs. Keep local scheduler disabled.

## Acceptance criteria
- [x] Slack signature/replay validation, challenge, event filtering, deduplication, recovery and mock/editor setup covered.
- [x] Admin has independent navigation, clear global scope, coherent overview, filters, accessible actions and states in both themes.
- [x] Connector qualification and editor improvements are recorded with evidence, limitations and source comparison.
- [ ] Complete batch edits before final verify, review, one develop-to-main PR and merge; monitor deployment.

## Final validation and release boundary
Local harness/security, unit tests, typecheck and builds passed. Full E2E: 219 passed, two new fixture/selector failures corrected and passed in focused reruns. The full local command exited nonzero; require full final CI before merge. Release completion is the single develop-to-main PR plus its successful production deploy, not this pre-release checklist. Real Slack Trigger scope/configuration and provider testing were explicitly deferred by the owner.
