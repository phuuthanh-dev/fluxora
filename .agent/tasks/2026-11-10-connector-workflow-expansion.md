# Task contract

## Identity
- Task ID: `2026-11-10-connector-workflow-expansion`
- Base commit: `a6efe1dfcd18f9b8a419e6023416f6b1f7f91145`
- Working branch: `develop` in stable checkout; remote PR from develop to main.
- Implementer/reviewer: Codex directly.

## Outcome
Deliver the owner's four approved steps in one batch, reusing existing execution, vault and connector patterns.

## Target slice IDs
- `APP-EXPANSION-1`
- `EDITOR-QUALIFICATION-1`
- `NOTION-1`

## In scope
- Qualify Slack/Notion multi-workspace where owner supplies safe test resources and reconcile release progress/Google review status.
- Improve execution, per-item failure and retry/debug UX only where inspection finds actual gaps.
- Add Slack thread reply/update message, Notion append blocks, GitLab issue update and pipeline/merge-request reads.
- Add bounded Jira Cloud connection, project/issue-type discovery and create/get/update/comment actions using documented authentication.
- Implement Atlassian personal data reporting and prepare an erasure review; keep production reporting and Jira public distribution disabled until review.

## Explicitly out of scope
- New framework, old node versions, unrelated connectors, unsolicited live provider side effects, Slack secret rotation, unapproved data deletion, local Slack OAuth.

## Acceptance criteria
- [ ] Existing OAuth isolation preserved; actual provider test gaps explicitly recorded.
- [ ] Execution UX communicates actual retry/version/write consequences and relevant item details.
- [ ] Requested connector operations and Jira work with server-side credentials and guided controls.
- [ ] Audit, one end-of-batch verify, one develop-to-main PR, passing CI and merge.

## Required evidence
- Boundary and adapter tests using synthetic credentials and responses; both-theme editor UX coverage; official provider/n8n references; full npm run verify at end.

## Safety boundaries
- Preserve unrelated next-env diff, all data and secrets; local scheduler disabled. Owner authorizes requested PR/merge and production release. Use live provider resources only with explicit safe scope.
