# Steam, editor mapping, failure alerts and Slack

## Identity

- Task ID: `2026-11-09-steam-editor-alerts-slack`
- Base commit: `4c6bea7`
- Working branch: `develop` (stable local checkout)
- Implementer and reviewer: Codex

## Target slice IDs

- `APP-EXPANSION-1`
- `EDITOR-QUALIFICATION-1`

## Outcome and scope

Implement the four owner-approved roadmap items in one batch: bounded Steam news polling with durable deduplication, insert upstream expressions in the editor, opt-in failed-execution notification via existing Google Chat or Telegram connections, and an incoming-webhook Slack action with its own encrypted connection. Preserve publication semantics, existing data and product UI conventions.

## Explicitly out of scope

Unrelated connectors, provider writes during testing, automatic retry of uncertain writes, general error-workflow orchestration, changing existing workflows or credentials, unrelated refactors, and multiple PRs or intermediate full verification.

## Acceptance criteria

- [x] Steam news trigger baselines current news, polls with bounded overlap and durable deliveries, and explains gaps and status.
- [x] Editor inserts a selected upstream expression into a focused compatible field without losing existing text.
- [x] Opt-in failed-live-execution alert sends a minimal safe message without loops or duplicate automatic delivery; handled errors do not send alerts.
- [x] Slack incoming webhook uses an encrypted workspace credential, safe request handling and mock support.
- [x] Relevant synthetic tests and both-theme UI cover new behavior; documentation records limitations.
- [x] Run final `npm run verify`.
- [ ] Create one develop-to-main PR, merge after checks, monitor deploy.

## Required evidence and safety

Use isolated test resources and synthetic provider responses. Do not disclose or use stored secrets or send real messages. User explicitly requests the final PR and merge/deployment; task-template defaults prohibiting them are superseded. Keep local scheduler disabled and preserve unknown data. Generate the code graph when imports change.

Final isolated verification passed 1,080 API tests with no skips, 74 web tests and 218 Playwright tests. No live provider writes or credentials were used. Two earlier full attempts exposed runner test double assumptions and inaccurate Slack output metadata; these were corrected before the passing run. Browser logs retain existing GSAP and WebGL warnings.
