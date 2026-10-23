# Implementation Plan

This is the execution order for the three-day MVP. It deliberately excludes cloud/VPS deployment until the product works locally.

## Current state

| Work item | Status | Evidence |
|---|---|---|
| npm monorepo and agent documentation | Complete | Root workspace, `AGENTS.md`, product/architecture/rules docs |
| Visual workflow-editor foundation | Complete | React Flow canvas, node catalog, inspector, local draft history, JSON import/export, graph validation |
| API health service | Complete | `GET /api/v1/health` |
| Persistence schema, migration, and Prisma service | Complete | PostgreSQL schema, initial migration, and NestJS Prisma module |
| Email/password authentication | Complete | Register/login/me/logout endpoints, Argon2id, hashed opaque sessions, login UI, PostgreSQL E2E |
| Workspace/workflow API CRUD, draft persistence, and immutable publish | Complete | Owner-only API routes; browser save/reload and publish verification |
| Inline mock execution engine | Complete | Persisted execution/node I/O, safe expressions, redaction, retry classification, and editor mock run |
| Redis/BullMQ process separation, inline development fallback, and cron scheduler | In progress | Queue/worker and scheduler code exist; Redis-backed worker and realtime event delivery remain to validate |
| Encrypted credential vault and live-capable Steam/Google Chat adapters | In progress | AES-256-GCM vault and backend adapters exist; credentials/UI/live verification remain next |

## Milestone 1 — Product foundation

### Completed

- Shared workflow graph contracts.
- First editor shell with drag/drop nodes, connection drawing, selection, configuration inspector, undo/redo, import/export, and DAG validation.
- Initial node registry for all MVP and roadmap nodes.

### Completed implementation slice

1. Build `WorkspaceModule` and owner-only guards.
2. Build `WorkflowModule`: create/list/get/update draft, publish immutable version, and clone.
3. Replace the editor's local notice/save behavior with API calls and server state.
4. Add foreign-key workflow-version pointers, pinned webhook-version schema, and workflow templates schema.

**Exit criterion:** a logged-in owner can create a workspace, create a workflow, save a draft graph, publish a frozen version, reload the page, and see the saved workflow.

## Milestone 2 — Reliable execution engine

### Completed foundation

- Manual mock execution persists a pinned workflow version and node I/O.
- Safe interpolation supports path access plus `upper`, `lower`, and `default`; arbitrary JavaScript is rejected.
- Redaction executes before execution input/output persistence.
- If/Else, Switch, error edges, retry classification, timeout-aware HTTP execution, and mock Steam/Google Chat actions exist in the runner.
- The editor can launch a mock run and inspect each selected node's result.

1. Add Redis and BullMQ configuration plus a separate worker process. **Implemented; Redis environment validation remains.**
2. Add execution/node-execution persistence, structured errors, redaction, timeout, and retry policy.
3. Add a worker process and a manual trigger executor.
4. Implement If/Else and Switch branching.
5. Stream execution state to the editor via SSE or Socket.IO.
6. Add mock-run fixtures and execution inspector views.

**Exit criterion:** a manual test run executes a pinned workflow version, shows node input/output in realtime, and routes retryable failures to an error branch after configured retries.

## Milestone 3 — Steam daily report

### Completed foundation

- Credential records are encrypted with AES-256-GCM and credential list responses never expose encrypted or raw values.
- Steam and Google Chat node executors are live-capable through backend-only credential resolution, while mock execution stays deterministic.

1. Add encrypted credential storage and credential-management UI.
2. Implement Steam Account Snapshot with a mock transport and real Web API transport.
3. Implement Google Chat incoming-webhook send action.
4. Add Cron scheduler and timezone handling.
5. Add the `Steam daily report` template with a tested message expression.

**Exit criterion:** a scheduled or manually triggered public Steam-account snapshot sends a real Google Chat daily report, with all sensitive values redacted from logs.

## Milestone 4 — Google data, webhooks, approvals, polish

### Completed foundation

- Published workflows can create a webhook endpoint pinned to that immutable version.
- Optional webhook secrets are SHA-256 hashed and compared in constant time; the raw secret is returned only while the owner creates or rotates the endpoint.
- Approval nodes persist an expiring approval request, pause the pinned execution, and allow an owner to approve/resume or reject from the node inspector.

1. Implement backend Google OAuth credential connection.
2. Implement Drive list/search and Sheets read/append.
3. Implement inbound webhook trigger with a hashed secret. **Implemented and locally verified.**
4. Implement Approval pause, notification link, owner approval UI, and execution resume. **Pause/resume/reject plus owner UI are implemented and locally verified; outgoing notification link remains part of connector polish.**
5. Finish audit logs, empty/error states, test coverage, README walkthrough, and demo recording.

**Exit criterion:** every MVP acceptance criterion in `docs/01-product-spec.md` is demonstrably satisfied locally.

## Working order for agents

- Work on one milestone slice at a time; do not start integrations before credentials and execution boundaries exist.
- Each slice needs a focused commit, tests or an explicit verification note, and documentation updates if behavior changes.
- Keep runtime secrets out of fixtures and client state.
- Do not add deployment configuration until Milestone 4 has passed local acceptance.
