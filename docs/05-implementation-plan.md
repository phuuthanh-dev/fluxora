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
| Redis/BullMQ process separation, inline development fallback, and cron scheduler | Complete locally | Inline queue, worker code, scheduler, and authenticated SSE delivery are locally verified; Redis-backed worker qualification is deferred until a Redis runtime is available |
| Encrypted credential vault and live-capable Steam/Google Chat adapters | Complete locally | AES-256-GCM vault, provider-aware credential UX, mock flows, and backend adapters are verified; live activation needs user credentials |
| Workspace dashboard and guarded live-run entry point | Complete locally | Dashboard is the authenticated landing page; workspace/workflow selection, blank/template creation, and publish-confirmed Go Live are browser-tested without invoking providers |
| Google account sign-in readiness | Complete locally | `AuthIdentity` migration, Google OIDC account callback, provider-configured UI state, identity/session tests, and local migration deployment; activation needs a Google web-client configuration |
| Steam identity OpenID readiness | Complete locally | State-bound authenticated identity linking, canonical claimed-ID/Steam validation, dashboard status, and unit/browser configuration checks; activation needs the public API callback and realm |
| GitHub account sign-in and identity lifecycle | Verified locally | GitHub authorization-code callback with verified-email lookup, shared identity/session model, social-identity unlink guard, auth rate-limit baseline, security headers, environment validation, and focused unit coverage. A user-owned GitHub OAuth App was configured locally and a browser sign-in returned to the authenticated dashboard. |
| Safe expression compatibility and terminal failure handling | Complete locally | Hyphenated node IDs resolve safely, the Steam daily report template uses the canonical `steam` step ID, and malformed expressions persist `INVALID_EXPRESSION` on the node and terminate inline executions instead of leaving them running. Unit, mock-run, and full quality-gate checks pass. |
| UI redesign contract and collapsible editor layout | Complete locally | `docs/13-ui-redesign-brief.md` defines the unified direction and staged migration; the canvas now reclaims Node Library width while the inspector remains stable, with Playwright and full quality-gate coverage. |
| Relay-inspired global design system foundation | Complete locally | Global semantic tokens, reusable button/surface recipes, provider-color rules, auth/dashboard/editor migration, focused token regression, full quality gate, and localhost visual QA are complete in `apps/web/src/app/design-system.css` and `globals.css`. |
| Global light/dark theme parity | Complete locally | Theme preference is applied before first paint, persisted in local storage, exposed on auth/dashboard/editor, and audited across reading surfaces, graph controls, forms, cards, and overlays with Playwright coverage. |
| Dashboard workflow management UX | Complete locally | Workflow search, Draft/Live filtering, name/status/last-updated sorting, clear controls, workspace-switch reset, shared controls, responsive styling, and Playwright regression coverage are complete. |
| Dashboard workflow lifecycle actions | Complete locally | Workflow cards support rename, duplicate, archive, and confirmation-based permanent delete; archive is persisted as a soft-delete and permanent delete is guarded when execution history exists. Dashboard regression coverage, localhost visual QA, and the full quality gate passed. |

## Milestone 1 — Product foundation

### Completed

- Shared workflow graph contracts.
- First editor shell with workspace/workflow library, blank/template workflow creation, drag/drop nodes, connection drawing, multi-select, search, deterministic auto-layout, copy/paste, context-menu duplicate/delete, configuration inspector, undo/redo, import/export, clone, immutable version history, and live DAG-validation details.
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
- If/Else, Switch (configured case-to-edge mappings), error edges, retry classification, timeout-aware HTTP execution, and mock Steam/Google Chat actions exist in the runner.
- Live HTTP Request supports optional encrypted Bearer, API-key, Basic Auth, or custom-header credentials; request body, headers, and timeout are configured without leaking credential values into the graph.
- The editor can launch a mock run, receive server-sent execution updates, and inspect selected-node redacted execution input, output/error, attempt, and duration as JSON tree, table, or raw JSON.
- Manual Trigger includes a JSON test-data editor; mock execution sends only that object as `triggerData`.
- Local HTTP E2E verifies a `NETWORK_ERROR` retries twice, follows its error edge, and pauses at a downstream Approval node.
- Local Switch E2E verifies a configured matching case executes while the default branch is persisted as skipped.
- Local If/Else E2E verifies the true branch executes while the false branch is persisted as skipped.
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
- Steam and Google Chat node executors are live-capable through backend-only credential resolution, while mock execution stays deterministic. Steam snapshots include profile, current game, owned/recent games and playtime, plus optional per-app achievements.
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
- Approval nodes persist an expiring approval request, pause the pinned execution, optionally send a Google Chat or encrypted HTTP-webhook notification with an authenticated app link on live runs, and allow that owner to open the app link directly into the pending execution before approving/resuming or rejecting from the node inspector.
- Google OAuth connection endpoints use a signed, short-lived state; they persist an encrypted Google credential after callback and refresh an expiring OAuth access token server-side. Drive list/search/text upload/download and Sheets read/append/update have live REST adapters.
- The Drive search → Sheets append mock path has been locally verified end-to-end, including persisted per-node output.

1. Validate Google OAuth and the live Drive/Sheets adapters with a user-supplied Google Cloud client and account.
2. Document the Google Cloud OAuth consent-screen setup in the demo walkthrough.
3. Implement inbound webhook trigger with a hashed secret. **Implemented and locally verified.**
4. Implement Approval pause, notification link, owner approval UI, and execution resume. **Pause/resume/reject plus owner UI are locally verified. Live runs can send an optional Google Chat notification containing the app link; validating delivery needs a user credential.**
5. Finish audit logs, empty/error states, test coverage, README walkthrough, and demo recording.

**Exit criterion:** every MVP acceptance criterion in `docs/01-product-spec.md` is demonstrably satisfied locally.

## Production-preparation follow-up

1. Add deployment/runtime hardening after provider configuration is supplied: production CORS/cookie policy, secure environment validation, health/readiness checks, migrations, Redis worker qualification, and Docker/VPS manifests.
2. **Completed locally — outbound request policy:** generic HTTP, Google Chat webhooks, and approval webhooks now validate protocol, hostname, resolved IP ranges, and redirect targets before requesting external services. The optional `OUTBOUND_ALLOWED_HOSTNAMES` setting is reserved for controlled internal DNS zones; it must never be `*`.

## Agent-assisted delivery follow-up

1. **Active — repository-native harness:** task contracts, factual handoff reports, generated internal-import graph, graph freshness validation, and CI-backed review make it possible to delegate bounded slices to a lower-cost implementation agent without trusting its prose.
2. **Next — credential-free regression expansion:** add deterministic failure-path and responsive UI coverage for the dashboard/editor. This remains mock-only and is safe to delegate after the harness passes.
3. **Needs user input — live provider validation:** validate the Steam → Google Chat flow only after the owner supplies credentials in the application and explicitly authorizes the external side effect.
4. **Deferred by product scope — Docker/VPS deployment:** start only after a VPS/domain decision and an explicit deployment request.

## Working order for agents

- Work on one milestone slice at a time; do not start integrations before credentials and execution boundaries exist.
- Each slice needs a focused commit, tests or an explicit verification note, and documentation updates if behavior changes.
- Keep runtime secrets out of fixtures and client state.
- Do not add deployment configuration until Milestone 4 has passed local acceptance.
