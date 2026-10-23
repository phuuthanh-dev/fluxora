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
| Redis/BullMQ process separation, inline development fallback, and cron scheduler | In progress | Queue/worker and scheduler code exist; authenticated SSE delivery is locally verified, while Redis-backed worker validation remains |
| Encrypted credential vault and live-capable Steam/Google Chat adapters | In progress | AES-256-GCM vault, credential-management UI, and backend adapters exist; live verification needs user credentials |

## Milestone 1 — Product foundation

### Completed

- Shared workflow graph contracts.
- First editor shell with drag/drop nodes, connection drawing, multi-select, search, deterministic auto-layout, copy/paste, context-menu duplicate/delete, configuration inspector, undo/redo, import/export, clone, immutable version history, and live DAG-validation details.
- Email has a configuration form but visibly remains unavailable in the MVP. Google Chat OAuth, OpenAI, Gemini, MongoDB, GitHub, Facebook Meta, and Instagram are available as schema-only planned nodes.
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
- Expressions support safe property paths and numeric array indexes; the inspector offers structured fields, JSON configuration, and click-to-copy output-path suggestions.
- Redaction executes before execution input/output persistence.
- If/Else, Switch, error edges, retry classification, timeout-aware HTTP execution, and mock Steam/Google Chat actions exist in the runner.
- Live HTTP Request supports optional encrypted Bearer, API-key, Basic Auth, or custom-header credentials; request body, headers, and timeout are configured without leaking credential values into the graph.
- The editor can launch a mock run, receive server-sent execution updates, and inspect selected-node redacted execution input, output/error, attempt, and duration as JSON tree, table, or raw JSON.
- Manual Trigger includes a JSON test-data editor; mock execution sends only that object as `triggerData`.
- Local HTTP E2E verifies a `NETWORK_ERROR` retries twice, follows its error edge, and pauses at a downstream Approval node.
- Cron scheduler test verifies a due published cron workflow creates and dispatches one live execution with schedule metadata.
- Owners can cancel queued, running, or waiting executions; the runner observes cancellation between nodes and the editor exposes a cancel control for active runs.

1. Add Redis and BullMQ configuration plus a separate worker process. **Implemented; Redis environment validation remains.**
2. Add execution/node-execution persistence, structured errors, redaction, timeout, and retry policy.
3. Add a worker process and a manual trigger executor.
4. Implement If/Else and Switch branching.
5. Stream execution state to the editor via SSE or Socket.IO. **Implemented with an owner-authorized SSE endpoint; the editor refreshes execution/node I/O on each event and HTTP E2E is verified.**
6. Add mock-run fixtures and execution inspector views.

**Exit criterion:** a manual test run executes a pinned workflow version, shows node input/output in realtime, and routes retryable failures to an error branch after configured retries.

## Milestone 3 — Steam daily report

### Completed foundation

- Credential records are encrypted with AES-256-GCM and credential list responses never expose encrypted or raw values.
- Steam and Google Chat node executors are live-capable through backend-only credential resolution, while mock execution stays deterministic.
- The editor can create/list encrypted credentials; OAuth and manual-token entry keep secret values out of frontend state after submission.

1. Add encrypted credential storage and credential-management UI.
2. Implement Steam Account Snapshot with a mock transport and real Web API transport.
3. Implement Google Chat incoming-webhook send action.
4. Add Cron scheduler and timezone handling.
5. Add the `Steam daily report` template with a tested message expression. **Implemented as the authenticated workspace's first workflow; it includes a 09:00 Asia/Ho_Chi_Minh cron schedule, Steam snapshot, and Google Chat message.**

**Exit criterion:** a scheduled or manually triggered public Steam-account snapshot sends a real Google Chat daily report, with all sensitive values redacted from logs.

## Milestone 4 — Google data, webhooks, approvals, polish

### Completed foundation

- Published workflows can create or rotate a webhook endpoint from the editor, pin it to that immutable version, and display its POST URL plus a one-time secret.
- Optional webhook secrets are SHA-256 hashed and compared in constant time; the raw secret is returned only while the owner creates or rotates the endpoint.
- Approval nodes persist an expiring approval request, pause the pinned execution, optionally send a Google Chat notification with an authenticated app link on live runs, and allow an owner to approve/resume or reject from the node inspector.
- Google OAuth connection endpoints use a signed, short-lived state; they persist an encrypted Google credential after callback and refresh an expiring OAuth access token server-side. Drive list/search/text upload/download and Sheets read/append/update have live REST adapters.
- The Drive search → Sheets append mock path has been locally verified end-to-end, including persisted per-node output.

1. Validate Google OAuth and the live Drive/Sheets adapters with a user-supplied Google Cloud client and account.
2. Document the Google Cloud OAuth consent-screen setup in the demo walkthrough.
3. Implement inbound webhook trigger with a hashed secret. **Implemented and locally verified.**
4. Implement Approval pause, notification link, owner approval UI, and execution resume. **Pause/resume/reject plus owner UI are locally verified. Live runs can send an optional Google Chat notification containing the app link; validating delivery needs a user credential.**
5. Finish audit logs, empty/error states, test coverage, README walkthrough, and demo recording.

**Exit criterion:** every MVP acceptance criterion in `docs/01-product-spec.md` is demonstrably satisfied locally.

## Working order for agents

- Work on one milestone slice at a time; do not start integrations before credentials and execution boundaries exist.
- Each slice needs a focused commit, tests or an explicit verification note, and documentation updates if behavior changes.
- Keep runtime secrets out of fixtures and client state.
- Do not add deployment configuration until Milestone 4 has passed local acceptance.
