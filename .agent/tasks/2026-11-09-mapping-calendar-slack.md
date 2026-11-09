# Mapping, Calendar trigger and Slack OAuth

## Identity

- Task ID: `2026-11-09-mapping-calendar-slack`
- Base commit: `163779f`
- Working branch: `develop`
- Implementer and reviewer: Codex

## Target slice IDs

- `APP-EXPANSION-1`
- `EDITOR-QUALIFICATION-1`
- `CALENDAR-1`

## Outcome and scope

Qualify the PR #109 functionality within authorized boundaries; improve existing editor data mapping and add a simple Edit Fields node; implement Google Calendar created/updated polling and Slack OAuth channel discovery and send. Reuse existing contracts, credential security, scheduler and execution conventions. Correct stale release notes.

## Explicitly out of scope

Unapproved provider writes or grants, new compatibility layers, unrelated features, uncontrolled changes to existing workflows and credentials, intermediate full verification, and multiple release PRs.

## Acceptance criteria

- [ ] Check current Steam, Slack webhook, failure alert and mapping paths; document real-provider limitations honestly.
- [ ] Improve mapping visibility and add a bounded, validated Edit Fields node with mock and live execution.
- [ ] Google Calendar trigger supports created/updated with safe, bounded checkpoint and selection UX.
- [ ] Slack OAuth supports workspace authorization, channel selection and sending, with encrypted credentials and safe errors.
- [ ] Add relevant behavioral tests; update product and release documentation.
- [ ] Run final `npm run verify`, review, create one develop-to-main PR and merge after checks; follow deployment.

## Required evidence and safety

Use synthetic provider responses unless the owner authorizes exact real resources. No secrets in logs or source; do not enable local scheduler. Preserve unknown data and avoid unnecessary worktrees. Check n8n/provider documentation and record only verified comparisons.
