# Roadmap

This file preserves the original phase order. Current completion evidence lives
in [`05-implementation-plan.md`](./05-implementation-plan.md) and
[`06-loop-engineering.md`](./06-loop-engineering.md); an item listed in a later
phase here may already have a locally verified foundation.

## Three-day MVP

### Day 1 — foundation and editor

- Establish monorepo, auth shell, workspace/workflow CRUD, and version model.
- Build React Flow editor with palette, inspector, persistence, validation, and undo/redo foundation.
- Implement Manual Trigger, If/Else, Switch, templates, JSON export/import.

### Day 2 — runner and primary demo

- Add PostgreSQL persistence, Redis/BullMQ runner, realtime execution updates, retry, timeout, and error edge.
- Implement Steam Account Snapshot, Google Chat incoming webhook, Manual/Cron runs, execution inspector, and mock runs.

### Day 3 — Google connectors and polish

- Add Google OAuth connection, Drive list/search, Sheets read/append, webhook trigger, and approval pause/resume.
- Add redaction, audit events, README, fixtures, walkthrough GIF/video, and end-to-end validation.

## Phase 2

- Scalable Node Library: Core nodes plus App → Operation discovery, search,
  browser-local recent/favorites, and template use-case tags.
- Notifications v1: Discord Incoming Webhook and Telegram Bot API action nodes with encrypted credentials and safe expression interpolation.
- Notification adapters: provider-neutral dispatcher and adapters for Google Chat, Discord, Telegram, and approval webhooks with normalized safe delivery results, Discord embeds/mention-policy, and vault-only Telegram bot tokens.
- Actual Email sending.
- OpenAI, Gemini, MongoDB, and additional GitHub operations.
- GitHub runtime operations beyond Create Issue; connector credentials remain separate from GitHub account OAuth.
- GitHub Add Label is the first additional runtime operation; further issue and pull-request operations remain separately qualified slices.
- GitHub Add Comment is the second additional runtime operation; pull-request operations and triggers remain separately qualified slices.
- GitHub Merge Pull Request is the first pull-request action; GitHub triggers and other pull-request operations remain separately qualified slices.
- GitHub Issue opened is the first provider-specific trigger; pull-request, push, and workflow-run triggers remain separately qualified slices.
- GitHub Pull request opened is the second provider-specific trigger; push and workflow-run triggers remain separately qualified slices.
- GitHub Push is the third provider-specific trigger; workflow-run triggers remain separately qualified slices.
- GitHub Workflow run completed is the fourth provider-specific trigger; additional GitHub triggers and operations remain separately qualified slices.
- Full Google Chat OAuth mode.
- Workspace members, roles, and credential sharing.
- Drive upload/download enhancements.

## Phase 3

- Batch, loop, merge, delay, rate limits, sub-workflows.
- Meta/Facebook and Instagram integrations.
- Version rollback, operation metrics, notifications, Docker Compose and VPS production deployment.

## Phase 4

- Connector SDK, marketplace, sandboxed code node, distributed workers, and advanced governance.
