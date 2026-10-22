# Implementation Plan

This is the execution order for the three-day MVP. It deliberately excludes cloud/VPS deployment until the product works locally.

## Current state

| Work item | Status | Evidence |
|---|---|---|
| npm monorepo and agent documentation | Complete | Root workspace, `AGENTS.md`, product/architecture/rules docs |
| Visual workflow-editor foundation | Complete | React Flow canvas, node catalog, inspector, local draft history, JSON import/export, graph validation |
| API health service | Complete | `GET /api/v1/health` |
| Persistence, authentication, and actual API CRUD | Next | No database schema or runtime data yet |
| Background execution engine | Planned | Day 2 |
| Google/Steam real connectors | Planned | Day 2–3 |

## Milestone 1 — Product foundation

### Completed

- Shared workflow graph contracts.
- First editor shell with drag/drop nodes, connection drawing, selection, configuration inspector, undo/redo, import/export, and DAG validation.
- Initial node registry for all MVP and roadmap nodes.

### Next implementation slice

1. Add Prisma, PostgreSQL schema, migrations, and seed data.
2. Build `AuthModule` with register/login, Argon2id password hashing, and HTTP-only cookie session/refresh flow.
3. Build `WorkspaceModule` and owner-only guards.
4. Build `WorkflowModule`: create/list/get/update draft, publish immutable version, clone, import/export.
5. Replace the editor's local notice/save behavior with API calls and server state.

**Exit criterion:** a logged-in owner can create a workspace, create a workflow, save a draft graph, publish a frozen version, reload the page, and see the saved workflow.

## Milestone 2 — Reliable execution engine

1. Add Redis and BullMQ configuration.
2. Add execution/node-execution persistence, structured errors, redaction, timeout, and retry policy.
3. Add a worker process and a manual trigger executor.
4. Implement If/Else and Switch branching.
5. Stream execution state to the editor via SSE or Socket.IO.
6. Add mock-run fixtures and execution inspector views.

**Exit criterion:** a manual test run executes a pinned workflow version, shows node input/output in realtime, and routes retryable failures to an error branch after configured retries.

## Milestone 3 — Steam daily report

1. Add encrypted credential storage and credential-management UI.
2. Implement Steam Account Snapshot with a mock transport and real Web API transport.
3. Implement Google Chat incoming-webhook send action.
4. Add Cron scheduler and timezone handling.
5. Add the `Steam daily report` template with a tested message expression.

**Exit criterion:** a scheduled or manually triggered public Steam-account snapshot sends a real Google Chat daily report, with all sensitive values redacted from logs.

## Milestone 4 — Google data, webhooks, approvals, polish

1. Implement backend Google OAuth credential connection.
2. Implement Drive list/search and Sheets read/append.
3. Implement inbound webhook trigger with a hashed secret.
4. Implement Approval pause, notification link, owner approval UI, and execution resume.
5. Finish audit logs, empty/error states, test coverage, README walkthrough, and demo recording.

**Exit criterion:** every MVP acceptance criterion in `docs/01-product-spec.md` is demonstrably satisfied locally.

## Working order for agents

- Work on one milestone slice at a time; do not start integrations before credentials and execution boundaries exist.
- Each slice needs a focused commit, tests or an explicit verification note, and documentation updates if behavior changes.
- Keep runtime secrets out of fixtures and client state.
- Do not add deployment configuration until Milestone 4 has passed local acceptance.
