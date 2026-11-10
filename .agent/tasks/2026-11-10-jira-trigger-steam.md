# Task contract

## Identity
- Task ID: `2026-11-10-jira-trigger-steam`
- Base commit: `1460218796ece7216a622cd28a12690007e6081a`
- Working branch: `develop`
- Implementer/reviewer: Codex, direct implementation and final review.

## Outcome
Add a Jira Cloud OAuth trigger using existing workflow and webhook boundaries; qualify production OAuth with the owner's independent account and prepare the requested Steam notification workflow.

## Target slice IDs
- `APP-EXPANSION-1`
- `CONNECTOR-LIVE-2`

## In scope
- Inspect reporting status and explain its actual attribution limits.
- Compare Jira Trigger against official n8n and Atlassian sources; securely register, renew, remove and receive authorized Jira events using the owner's own connection.
- Qualify production Jira with the specified independent user and approved test site.
- Update the existing Steam report and add news for the three owner-selected app IDs after identifying the achievement game; preserve existing notification destinations.

## Explicitly out of scope
- Other apps, new node versions, duplicated engine or privacy frameworks, unrelated UI/refactoring, destructive cleanup and credential rotation.

## Acceptance criteria
- [ ] Jira events are authenticated, workspace/version scoped, and registrations have an observable lifecycle with bounded failure behavior.
- [ ] Jira production qualification and reporting state are documented honestly.
- [ ] Steam report and news use the selected games and existing channels.
- [ ] Perform one final audit and verify, then one develop-to-main PR and merge after CI.

## Required evidence
- Synthetic tests for OAuth, webhook registration, verification, renewal, ownership and execution; UX coverage for the trigger.
- Provider checks only with authorized resources; final `npm run verify` and codegraph generation if required.

## Safety boundaries
- Preserve unknown data, the pre-existing next-env change and production reporting configuration.
- Never log or commit secrets; do not send unsolicited real-provider messages.
- The owner authorized the PR and merge; provider permissions and legal approvals remain subject to their specific confirmation.
