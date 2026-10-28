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
| Redis/BullMQ process separation, inline development fallback, and cron scheduler | Complete locally and in CI | A pinned isolated local Redis runtime and CI Redis service verify API/worker handoff, bounded concurrency, delayed retry primitives, persisted runs, owner-scoped SSE, shutdown/restart, and single-attempt dispatch without test-level skips. |
| Encrypted credential vault and live-capable Steam/Google Chat adapters | Complete locally | AES-256-GCM vault, provider-aware credential UX, mock flows, and backend adapters are verified; live activation needs user credentials |
| Workspace dashboard and guarded live-run entry point | Complete locally | Dashboard is the authenticated landing page; workspace/workflow selection, blank/template creation, and publish-confirmed Go Live are browser-tested without invoking providers |
| Google account sign-in readiness | Complete locally | `AuthIdentity` migration, Google OIDC account callback, provider-configured UI state, identity/session tests, and local migration deployment; activation needs a Google web-client configuration |
| Steam identity OpenID readiness | Complete locally | State-bound authenticated identity linking, canonical claimed-ID/Steam validation, dashboard status, and unit/browser configuration checks; activation needs the public API callback and realm |
| GitHub account sign-in and identity lifecycle | Verified locally | GitHub authorization-code callback with verified-email lookup, shared identity/session model, social-identity unlink guard, auth rate-limit baseline, security headers, environment validation, and focused unit coverage. A user-owned GitHub OAuth App was configured locally and a browser sign-in returned to the authenticated dashboard. |
| GitHub connector Create Issue | Complete locally | Workspace-owned `GITHUB` credentials are encrypted independently from GitHub account sign-in. The GitHub Create Issue node has reusable credential/repository/title/body/labels fields, mock-safe execution, guarded live `api.github.com` transport, normalized output, retry classification, readiness checks, and token-safe tests. Real issue creation remains owner-approved. |
| GitHub Create Issue idempotency guard | Complete locally | An optional bounded key is hashed into a hidden issue marker, existing issues are searched before creation, and repeated live requests return the existing issue without a second POST. The connector explicitly remains best effort because GitHub's Issues API has no native idempotency key. |
| GitHub Add Label | Complete locally | A separate executable operation node reuses the workspace-owned GitHub connector credential, validates repository/issue/label inputs, supports deterministic mock execution and guarded live requests, normalizes the returned label set, and shares safe timeout/retry classification. |
| GitHub Add Comment | Complete locally | A separate executable operation node reuses the workspace-owned GitHub connector credential, validates repository/issue/comment inputs, supports deterministic mock execution and guarded live requests, normalizes comment identity/body output, and shares safe timeout/retry classification. |
| GitHub Merge Pull Request | Complete locally | A separate executable destructive operation node reuses the workspace-owned GitHub connector credential, validates repository/pull-request/merge-method inputs, supports deterministic mock execution and guarded live requests, normalizes merge output, and shares safe timeout/retry classification. |
| GitHub Issue opened trigger | Complete locally | A provider-specific webhook trigger reuses the published endpoint lifecycle, requires an encrypted GitHub connector `webhookSecret`, verifies raw-body HMAC-SHA256 signatures and `issues.opened`, and dispatches only verified payloads. Real GitHub webhook delivery remains owner/operator-configured. |
| GitHub Pull request opened trigger | Complete locally | A second provider-specific webhook trigger reuses the same published endpoint lifecycle and encrypted GitHub connector `webhookSecret`, verifies raw-body HMAC-SHA256 signatures and `pull_request.opened`, and dispatches only verified payloads. Real GitHub webhook delivery remains owner/operator-configured. |
| GitHub Push trigger | Complete locally | A third provider-specific webhook trigger reuses the same published endpoint lifecycle and encrypted GitHub connector `webhookSecret`, verifies raw-body HMAC-SHA256 signatures and the event-only `push` webhook, and dispatches only verified payloads. Real GitHub webhook delivery remains owner/operator-configured. |
| GitHub Workflow run completed trigger | Complete locally | A fourth provider-specific webhook trigger reuses the same published endpoint lifecycle and encrypted GitHub connector `webhookSecret`, verifies raw-body HMAC-SHA256 signatures and `workflow_run.completed`, and dispatches only verified payloads. Real GitHub webhook delivery remains owner/operator-configured. |
| Safe expression compatibility and terminal failure handling | Complete locally | Hyphenated node IDs resolve safely, the Steam daily report template uses the canonical `steam` step ID, and malformed expressions persist `INVALID_EXPRESSION` on the node and terminate inline executions instead of leaving them running. Unit, mock-run, and full quality-gate checks pass. |
| UI redesign contract and collapsible editor layout | Complete locally | `docs/13-ui-redesign-brief.md` defines the unified direction and staged migration; the canvas now reclaims Node Library width while the inspector remains stable, with Playwright and full quality-gate coverage. |
| Relay-inspired global design system foundation | Complete locally | Global semantic tokens, reusable button/surface recipes, provider-color rules, auth/dashboard/editor migration, focused token regression, full quality gate, and localhost visual QA are complete in `apps/web/src/app/design-system.css` and `globals.css`. |
| Global light/dark theme parity | Complete locally | Theme preference is applied before first paint, persisted in local storage, exposed on auth/dashboard/editor, and audited across reading surfaces, graph controls, forms, cards, and overlays with Playwright coverage. |
| Dashboard workflow management UX | Complete locally | Workflow search, Draft/Live filtering, name/status/last-updated sorting, clear controls, workspace-switch reset, shared controls, responsive styling, and Playwright regression coverage are complete. |
| Dashboard workflow lifecycle actions | Complete locally | Workflow cards support rename, duplicate, archive, and confirmation-based permanent delete; archive is persisted as a soft-delete and permanent delete is guarded when execution history exists. Dashboard regression coverage, localhost visual QA, and the full quality gate passed. |
| Template gallery and notification starters | Complete locally | The dashboard onboarding reads a protected template registry and presents Steam daily-report starters for Google Chat, Discord, and Telegram with graph and connection previews. Each remains mock-safe until a user configures credentials and confirms a live run. |
| Declarative provider configuration fields | Complete locally | The node catalog declares reusable field metadata for credential selection, text, multi-line content, and numeric values. The Inspector consumes it for notification, Google Workspace, HTTP, and roadmap nodes while specialized controls remain explicit where their interaction is genuinely different. |
| Resource-aware provider configuration fields | Complete locally | The shared field contract now supports static selects and authenticated resource pickers. GitHub repository selection is the first implementation; the same contract is reserved for future Drive files, Sheets, Telegram destinations, Discord channels, Steam identities, and other provider-owned resources. |
| Discord mention-policy guard | Complete locally | Discord's inspector exposes content, embeds, and optional allowed-mentions JSON. The runtime accepts a strict allowlist only, defaults to no parsed mentions, and fails before outbound delivery when JSON is malformed or contains unsupported values. |
| Compact checkbox controls | Complete locally | Shared `.checkbox-field` controls are reduced from 14×14px to 12×12px without shrinking the label click target; editor regression coverage and the full quality gate passed. |
| Dashboard Execution Center and compact workflow menu | Complete locally | Dashboard lists recent workspace-scoped executions with loading, empty, status, error, and open-workflow states; workflow card actions use a compact vertical three-dot dropdown. Responsive styling, API ownership coverage, Playwright regression, and the full quality gate passed. |
| Editor connection affordance | Complete locally | Dragging from a node output enters an explicit connection mode, highlights and pulses target handles, expands only the temporary hit-area, and exposes a live instruction without changing node dimensions. Playwright covers start/end interaction and the full quality gate. |
| Live-provider readiness preflight | Complete locally | A read-only readiness endpoint checks the published graph and validates credential selection/provider ownership before live execution. Go Live now shows blockers, retry, and credential navigation while server-side confirmation and guards remain authoritative; no provider call occurs during preflight. Unit, browser, and full quality-gate checks passed. |
| Node-level mock debug | Complete locally | The selected supported node can be saved and run alone from the inspector using mock transport only. Its redacted input/output/error is persisted as an execution, downstream nodes are skipped, and live node debug is rejected. Approval nodes retain their full-workflow pause/resume behavior. |
| Execution-focused navigation | Complete locally | The Execution Center opens an immutable execution snapshot inside the editor, with a visible Test/Live mode, pinned version, terminal state, and automatic focus on the most relevant node execution. |
| Explicit workflow activation | Complete locally | Publish and activation are separate workflow states. Activation needs the server-side live-credential preflight; it enables Cron/Webhook ingress without running a manual execution. Deactivation stops new trigger ingress without cancelling work already queued or running. |
| Execution Center triage | Complete locally | The dashboard remains compact by default but can refresh execution history independently, recover from its own loading error, and filter current recent runs by attention, active work, failures, or successes before opening the immutable execution detail. |
| Safe retry and trigger idempotency | Complete locally | Failed executions can create a new run only from their original pinned version and original redacted trigger payload. Mock retry remains mock; a live retry requires a second explicit confirmation and re-evaluates live credentials. Cron dispatches use a durable occurrence key and public webhooks accept an optional endpoint-scoped `Idempotency-Key`. |
| Execution Center pagination | Complete locally | Execution history uses an owner-scoped stable cursor and a 1–50 bounded API page size. The dashboard appends further history with a dedicated loading affordance without resetting triage filters or losing already rendered runs. |
| Dedicated Connections and Executions pages | Complete locally | Workspace-scoped `/dashboard/connections` reuses the encrypted credential manager without an editor-only close affordance; `/dashboard/executions` provides independent loading, empty, error/retry, filtering, pagination, and immutable execution inspection. Both share page, status, skeleton, and progress primitives and have focused Playwright coverage. |
| Responsive node inspector drawer | Complete locally | At desktop widths up to 1080px, selecting a node opens a dedicated inspector drawer instead of silently hiding configuration. The drawer supports a backdrop, Escape, focus trapping, focus return, reduced motion, and a persistent Inspector trigger; Playwright covers the user flow at 1024px. |
| Shared authenticated application shell | Complete locally | Dashboard, Connections, Executions, and Editor use one workspace-aware App Shell for product navigation, account, theme, and sign-out. The editor has a visually distinct local toolbar for workflow commands only; Playwright guards the boundary. |
| Persisted user avatar identity | Complete locally | A database-backed avatar palette and initials trigger replace the generic Account text; file/image upload remains deliberately out of scope until asset storage and profile settings are introduced. |
| Shared section and toolbar primitives | Complete locally | Reusable `SectionHeader` and `Toolbar` now power workflow controls and execution filters, reducing page-specific hierarchy/action markup while preserving existing browser behavior. |
| App → Operation Node Library | Complete locally | The information architecture is defined in `docs/16-node-library-information-architecture.md`; the editor now preserves existing node type IDs while adding Core/App discovery, explicit operations, browser-local recent/favorites, use-case template tags, and light/dark browser regression coverage. The full repository quality gate passed. |
| Add-node action contrast and primitive reuse | Complete locally | The collapsed Node Library trigger now uses the shared secondary `Button`, semantic panel/ink/accent tokens, and a plus icon. Automated contrast coverage checks its label and icon in both themes while editor collapse/reopen behavior remains covered. |
| Accessibility Hardening v1 | Complete locally | Three bounded slices cover Node Library/command-bar keyboard navigation, shared dialog/drawer/menu focus lifecycle, and zoom/reduced-motion/light-dark regression without changing runtime or provider behavior. Focused checks and the repository-wide quality gate pass. |
| Production Release Candidate v1 | Merged into `main`; repository checks passed | High-confidence tracked-secret scan, non-printing production environment validation, dependency audit, backup-before-migration deployment contract, isolated restore/rollback/health runbook, and protected-environment release evidence are implemented. VPS/DNS/TLS, real environment validation, restore drill, and provider smoke remain operator/owner-gated. |
| Credential dependency clarity | Complete locally | The connection center shows safe current workflow and active-execution references before rename, rotation, or deletion; secrets and graph payloads remain server-only. |
| Dense-canvas navigation and minimap | Complete locally | The editor provides shared icon-button controls for fit, zoom, selected-node centering, and minimap visibility without changing workflow graph semantics. |
| Public landing foundation | Complete locally | The changed product requirement introduces a public `/` landing route and moves the existing authenticated sign-in experience to `/login`. It is a clean-room Fluxora implementation guided by the purchased Relay prompt, not imported template source; focused landing/auth coverage, visual review, and the full quality gate passed. |
| Landing motion and WebGL enhancement | Complete locally | The public landing uses Motion for restrained content polish and two lazy React Three Fiber islands for the hero/lifecycle visual language. Server-rendered content stays readable without JavaScript or WebGL; reduced motion, visibility, and viewport boundaries prevent decorative rendering from affecting product functionality. Focused fallback coverage, visual review, and the full quality gate passed. |
| Clean-room public landing v2 | Complete locally; owner-directed visual revision | The owner reopened L12.3 after supplying the Relay video and approving the Catmull-Rom/GLSL/ScrollTrigger/Lenis brief. The revision adds a local workflow replay, keyboard product tabs, a continuous procedural ribbon, lime fold plate, reliability, sample daily activity, and workflow cases. The landing owns its scroll/render lifecycle; authenticated routes keep native scrolling. See `docs/22-public-landing-v2.md` and the latest `.agent/reports/2026-10-29-landing-art-direction.md` for current evidence; prior island-only exclusions are superseded. |

## Milestone 1 — Product foundation

### Completed

- Shared workflow graph contracts.
- First editor shell with workspace/workflow library, blank/template workflow creation, drag/drop nodes, connection drawing, multi-select, search, deterministic auto-layout, copy/paste, context-menu duplicate/delete, configuration inspector, undo/redo, import/export, clone, immutable version history, and live DAG-validation details.
- Email has a configuration form but visibly remains unavailable in the MVP. Google Chat OAuth, OpenAI, Gemini, MongoDB, Facebook Meta, and Instagram remain schema-only planned nodes; GitHub now has executable Create Issue, Add Label, Add Comment, Merge Pull Request, Issue opened, Pull request opened, Push, and Workflow run completed nodes while its remaining triggers and operations remain planned.
- Initial node registry for all MVP and roadmap nodes.

### Completed implementation slice

1. Build `WorkspaceModule` and owner-only guards.
2. Build `WorkflowModule`: create/list/get/update draft, publish immutable version, and clone.
3. Replace the editor's local notice/save behavior with API calls and server state.
4. Add foreign-key workflow-version pointers, pinned webhook-version schema, and workflow templates schema.

## Next UI/UX roadmap

1. **Operational usability:** build on the completed execution timeline/diagnostic export with saved triage views and retention visibility; do not expose raw secrets or provider URLs.

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
- The inspector can run one supported node in mock mode after saving the draft. This creates a normal persisted execution, runs no downstream node, and never calls a provider. Approval nodes are intentionally tested only through a full workflow run.
- The Execution Center opens a focused immutable execution snapshot rather than relying on the current draft graph, retaining the exact node layout/configuration that produced the run.
- Go Live activates a published workflow only after readiness passes. Manual live execution remains a separate explicit confirmation; deactivation prevents new Cron/Webhook ingress while preserving existing execution history.
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

1. **Completed locally — deployment/runtime hardening:** production CORS/cookie policy, secure environment validation, health/readiness checks, migrations, Redis worker qualification, Docker/VPS manifests, immutable image deployment, rollback retention, two-domain Nginx routing for `fluxora.io.vn` and `api.fluxora.io.vn`, and CI/CD release checks are implemented. Live rollout remains operator-gated on the VPS certificate, configured domain, and secrets.
2. **Completed locally — outbound request policy:** generic HTTP, Google Chat webhooks, and approval webhooks now validate protocol, hostname, resolved IP ranges, and redirect targets before requesting external services. The optional `OUTBOUND_ALLOWED_HOSTNAMES` setting is reserved for controlled internal DNS zones; it must never be `*`.

## Agent-assisted delivery follow-up

1. **Active — repository-native harness:** task contracts, factual handoff reports, generated internal-import graph, graph freshness validation, and CI-backed review make it possible to delegate bounded slices to a lower-cost implementation agent without trusting its prose.
2. **Next — credential-free regression expansion:** add deterministic failure-path and responsive UI coverage for the dashboard/editor. This remains mock-only and is safe to delegate after the harness passes.
3. **Needs user input — live provider validation:** validate the Steam → Google Chat flow only after the owner supplies credentials in the application and explicitly authorizes the external side effect.
4. **Operator-gated — live provider and production validation:** deployment automation is ready, but real provider calls, OAuth callback validation, and production go-live still require the owner's configured domains, secrets, and explicit release approval.

## Working order for agents

- Work on one milestone slice at a time; do not start integrations before credentials and execution boundaries exist.
- Each slice needs a focused commit, tests or an explicit verification note, and documentation updates if behavior changes.
- Keep runtime secrets out of fixtures and client state.
- Do not add deployment configuration until Milestone 4 has passed local acceptance.
