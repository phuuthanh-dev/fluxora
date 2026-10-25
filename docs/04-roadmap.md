# Roadmap

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

- Notifications v1: Discord Incoming Webhook and Telegram Bot API action nodes with encrypted credentials and safe expression interpolation.
- Actual Email sending.
- OpenAI, Gemini, MongoDB, GitHub nodes.
- GitHub runtime node and OAuth credential mode.
- Full Google Chat OAuth mode.
- Workspace members, roles, and credential sharing.
- Drive upload/download enhancements.

## Phase 3

- Batch, loop, merge, delay, rate limits, sub-workflows.
- Meta/Facebook and Instagram integrations.
- Version rollback, operation metrics, notifications, Docker Compose and VPS production deployment.

## Phase 4

- Connector SDK, marketplace, sandboxed code node, distributed workers, and advanced governance.
