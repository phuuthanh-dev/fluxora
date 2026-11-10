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
- [x] Jira event authentication, workspace/version scoping and registration lifecycle have synthetic coverage. On 2026-11-11, a real created-issue event for test issue BTS-9 reached the isolated production workflow v1 and its trigger succeeded. The workflow was then deactivated; its registration and test issue remain. Renewal and other event types were not live-qualified.
- [x] Independent Jira production OAuth/read and reporting state were checked; this is not proof of complete tenant isolation or arbitrary-person attribution.
- [x] Steam daily v9 and the three selected news workflows are published and active with the selected destinations; scheduled v9 delivery and a new news delivery have not yet been observed.
- [x] Full audit/verify and PR #121 were completed and merged; subsequent PRs #122 and #123 addressed proxy logging and the owner's requested UI changes.

## Required evidence
- Synthetic tests for OAuth, webhook registration, verification, renewal, ownership and execution; UX coverage for the trigger.
- Provider checks only with authorized resources; final `npm run verify` and codegraph generation if required.

## Provider comparison
- [n8n Jira Trigger source](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Jira/JiraTrigger.node.ts) exposes several event types and multiple selections, with webhook existence, creation and deletion logic. Fluxora's current Jira Cloud trigger deliberately covers one selected issue-created, updated or deleted event per node and one selected project; it is not full event parity.
- [Atlassian's dynamic webhook documentation](https://developer.atlassian.com/cloud/jira/software/webhooks/) specifies a five-webhook limit per OAuth app/user/site and a 30-day expiry requiring renewal. Fluxora implements registration lifecycle and renewal; one production creation event was delivered successfully, but actual renewal has not been verified end to end.

## Safety boundaries
- Preserve unknown data, the pre-existing next-env change and production reporting configuration.
- Never log or commit secrets; do not send unsolicited real-provider messages.
- The owner authorized the PR and merge; provider permissions and legal approvals remain subject to their specific confirmation.
