# Architecture

## System shape

```text
Next.js web app
  ↕ REST + realtime status
NestJS API ── PostgreSQL
  │
  ├── Scheduler (cron and webhook ingress)
  └── Redis / BullMQ ── NestJS worker ── Third-party APIs
```

The API accepts user requests and creates execution records. The worker executes nodes outside the HTTP request lifecycle. Scheduler, API, and worker are separate NestJS processes conceptually, even if local MVP development launches them together.

Production uses `EXECUTION_QUEUE_MODE=redis`; it never silently degrades to inline execution. The API exposes liveness at `/api/v1/health` and dependency readiness at `/api/v1/health/ready`; readiness verifies PostgreSQL and Redis queue availability plus queue depth. The separate worker must use the same Redis URL, queue/event namespaces, and `APP_ENCRYPTION_KEY` as the API. Redis Pub/Sub carries redacted execution invalidation events from workers to the API process; the authenticated SSE route still performs the owner authorization check before subscribing.

`EXECUTION_WORKER_CONCURRENCY` bounds simultaneous jobs per worker and defaults to two (valid range: 1–20). Scale by adding workers first; readiness exposes the configured per-worker capacity and active queue count so an operator can see saturation.

Only the API process runs scheduler ingress. The worker starts the Nest application context for execution dependencies but identifies itself as `PROCESS_ROLE=worker`, which disables cron scheduling and prevents duplicate scheduled runs when workers scale horizontally.

Every active execution owns a short lease. The runner renews it while progressing nodes. BullMQ stalled-job replay is disabled for execution workers because a live provider may already have accepted a side effect. API maintenance marks a lease that expires as a terminal `EXECUTION_LEASE_EXPIRED` failure; a human may then explicitly retry with a fresh live confirmation. Maintenance also prunes terminal execution records by outcome-specific age and total count; waiting and running executions are never eligible.

The web dashboard is the authenticated control plane: it selects a workspace, lists workflows, and routes into a workflow-scoped editor URL. The editor distinguishes a deterministic mock test run from a guarded live run. Live requests use only `publishedVersion`; the API remains the final authorization and version-pinning boundary.

## Monorepo boundaries

```text
apps/web: React UI only; never stores provider credentials or executes provider calls. A freshly generated webhook signing or header-auth secret is displayed once to the authenticated owner for manual sender setup and is not retrievable afterward.
apps/api: REST API, authentication, persistence, scheduler, node registry, worker.
packages/workflow-contracts: Shared graph DTOs, node metadata, expression types.
infra: Docker Compose, deployment scripts, and Nginx templates for the VPS runtime.
```

## Workflow model

`Workflow` owns metadata and current draft pointer. `WorkflowVersion` stores the graph snapshot as JSONB and is immutable once published. An `Execution` references `workflowVersionId`; a `NodeExecution` references `executionId` and `nodeId`.

Node configuration must be validated twice: once in the web editor for feedback and once in the API/worker as the trust boundary.

## Execution algorithm

1. Create execution record with the current draft version for mock test runs, or the immutable published version for live/scheduled/webhook runs.
2. Enqueue a BullMQ job containing only execution ID.
3. Worker loads the immutable version, credentials, and trigger payload.
4. Validate graph and select the next reachable node.
5. Resolve safe expressions against completed node output.
6. Persist node state before and after executor invocation.
7. Route along success, conditional, switch, or error edge.
8. On approval, persist waiting state and end the job without failure.
9. On approval resolution, enqueue the same execution to resume.
10. Redact and publish status events to the UI.

MVP graph is a DAG. Control nodes select one downstream path; action nodes select success or error path.

Execution detail is owner-scoped and derived from the immutable workflow version plus persisted execution/node records. It exposes timestamps, duration, attempt count, retryability, error-branch routing, and conservative skip reasons. The downloadable `fluxora.execution-diagnostic.v1` snapshot intentionally excludes graph configuration, trigger data, node input/output, credentials, headers, and provider URLs; it is support metadata, not a secret-bearing execution export.

## Connector architecture

Each integration supplies:

- App manifest: stable app identity, label, icon, discovery category, and aliases.
- Operation manifest: stable node type, trigger/action/search/utility role,
  input/output schema, form fields, availability, and credential requirements.
- Backend executor: server-side implementation of the node contract.
- Optional mock resolver: deterministic output for test runs.

Configuration fields are declarative and must choose the strongest safe UI
control available: static selects for bounded enums, authenticated resource
pickers for provider-owned resources, and expression-aware hybrid inputs for
runtime values such as issue numbers. Resource discovery always crosses the
API boundary; the browser never calls a provider or receives connector
secrets. Workflow graphs persist stable provider identifiers such as
`owner/repository`, while credentials remain reusable authentication
connections rather than per-resource copies.

App and operation metadata is source-owned in the MVP. Workflow graphs persist
only stable node type identifiers and configuration, so discovery taxonomy can
evolve without migrating immutable workflow versions. See
`docs/16-node-library-information-architecture.md`.

The generic executor contract is:

```ts
type NodeExecutionResult = {
  status: "success" | "failed" | "waiting";
  output: Record<string, unknown>;
  error?: { code: string; message: string; retryable: boolean };
};
```

## Security baseline

- Hash passwords with Argon2id.
- Encrypt provider secrets using AES-256-GCM and a deployment-provided key.
- Use HTTP-only secure cookies for refresh token flow; short-lived access tokens.
- Mask sensitive headers/fields before persisting an execution.
- Hash webhook secrets and compare in constant time.
- Validate user-configurable HTTP and webhook destinations before every outbound request. Block loopback, private, link-local, multicast, and reserved IP ranges after DNS resolution; validate each redirect target and permit cross-origin redirects only through an explicit future policy.
- Use allowlisted expression helpers; never execute user JavaScript.
- Restrict CORS to the web application origin.
- External account identities live in `auth_identities`, separate from encrypted workspace credentials. Google login verifies state, issuer, audience, and a verified email; GitHub login exchanges the authorization code server-side and requires a verified GitHub email. Both create/link an identity and issue the same opaque session cookie as password login; provider access tokens are discarded after identity retrieval.
- Steam OpenID, when enabled, records a Steam identity link only. The API issues a state-bound OpenID request, verifies Steam's `check_authentication` response and a canonical HTTPS claimed Steam ID, then links it to the already authenticated app user. It is not an authorization grant for Steam Web API data and cannot satisfy a Steam Account Snapshot credential.

## Persistence model

Core tables: `users`, `auth_identities`, `sessions`, `workspaces`, `workspace_members`, `workflows`, `workflow_versions`, `credentials`, `executions`, `node_executions`, `approval_requests`, `webhook_endpoints`, `audit_logs`, `workflow_templates`.

JSONB is appropriate for workflow graph/configuration and node I/O; relational columns handle IDs, ownership, status, timestamps, and common filters.

The MVP pins Prisma ORM 6.12.0 because the local Node 23 runtime is outside Prisma ORM 7's supported LTS range and the later 6.16.x CLI dependency tree has unresolved audit findings in this environment. Upgrade Prisma together with the runtime after the MVP; do not mix major Prisma client/CLI versions.

## External API notes

- Google OAuth callbacks occur on the API server, not the web app.
- Google Drive/Sheets use a shared OAuth credential where scopes allow it.
- Owner-scoped resource discovery proxies paginated Drive text files and Google spreadsheets through the API, returning file IDs and names without credentials. Search operates on loaded pages; users can enter IDs or expressions manually. The existing OAuth connection currently requests broad Drive access; a narrower scope and Google Picker flow require separate compatibility review.
- Google Chat incoming webhook URLs are treated as secrets and deliver outward notifications via the notification dispatcher.
- Discord incoming webhook URLs are treated as secrets and deliver channel messages with SSRF validation, default-deny allowed mentions, and optional embeds via the notification dispatcher.
- Telegram Bot API delivers messages to typed destinations (DM, group, supergroup, or channel) configured at the node level using encrypted bot tokens; supergroups may include a topic/thread ID. Bot tokens are strictly redacted from URLs, logs, persisted execution states, and error messages; legacy credential chat IDs are supported as a deprecated fallback.
- Steam requests require API-key credentials and only expose data allowed by the configured API/public profile settings.
- GitHub Create Issue uses a separate workspace token credential. Because the GitHub Issues API has no native idempotency key, an optional user-supplied key is hashed into a hidden issue-body marker and looked up before creation; this is documented as connector-level best effort, not an atomic provider guarantee.
- GitHub Add Label is a separate operation node using the same workspace token and fixed `api.github.com/repos/{owner}/{repo}/issues/{number}/labels` route. Its response is normalized to the provider label set and shares the connector timeout, retryability, and safe-error policy.
- GitHub Add Comment is a separate operation node using the same workspace token and fixed `api.github.com/repos/{owner}/{repo}/issues/{number}/comments` route. Its response is normalized to comment ID, URL, and body and shares the connector timeout, retryability, and safe-error policy.
- GitHub Merge Pull Request is a separate destructive operation node using the same workspace token and fixed `api.github.com/repos/{owner}/{repo}/pulls/{number}/merge` route. It accepts only `merge`, `squash`, or `rebase`, relies on the existing explicit live-run confirmation boundary, and shares safe timeout, retryability, and error policy.
- GitHub Issue opened is a webhook trigger pinned to the published workflow version. The API keeps the raw request body, verifies `X-Hub-Signature-256` with the registration signing secret, rejects mismatched event/action before queueing, and dispatches only the verified payload. Webhook registration remains operator-configured in GitHub for this slice.
- GitHub Pull request opened uses the same pinned webhook lifecycle, raw-body HMAC verification, and pre-queue event/action filtering for `pull_request.opened`. Webhook registration remains operator-configured in GitHub.
- GitHub Push uses the same pinned webhook lifecycle and raw-body HMAC verification, but filters the event-only `push` header because GitHub push payloads do not use an action field. Webhook registration remains operator-configured in GitHub.
- GitHub Workflow run completed uses the same pinned webhook lifecycle, raw-body HMAC verification, and pre-queue event/action filtering for `workflow_run.completed`. Webhook registration remains operator-configured in GitHub.
- GitHub repository resources are listed through an owner-scoped API proxy
  using the encrypted connector token server-side. Actions can persist a
  selected `owner/repository`, and GitHub triggers can optionally filter
  verified webhook payloads by `repository.full_name`; old graphs without the
  filter remain compatible. Webhook registration remains separate from the
  reusable GitHub connection.
- Each workflow's webhook endpoint is its own registration. New GitHub
  registrations generate a signing secret encrypted with the credential vault
  key and return it once at creation or rotation. Existing registrations
  without an encrypted signing secret continue to use their connector's legacy
  `webhookSecret` until rotated. Rotation changes the active secret immediately;
  the operator must update the GitHub webhook. Registration is manual and is
  pinned to the published workflow version; one endpoint per workflow remains
  the current product boundary.
- Registration writes lock the workflow row and require the published version
  ID plus the endpoint ID and `updatedAt` last observed by the client (or a
  null endpoint for creation). Stale writes and pre-existing duplicates are
  rejected. Clients using the older request format must reload and use the new
  format. The application-level lock cannot prevent direct database writes;
  the database does not yet enforce a unique workflow ID for endpoints.
- Webhook trigger inspectors link directly to the existing endpoint setup
  panel. This improves discoverability but does not automate GitHub webhook
  creation: an owner still configures the repository webhook manually.
- GitHub repository pickers can filter the currently loaded pages by owner;
  this is a convenience filter, not a security boundary or a global search.
  A stored value outside loaded results remains selectable but is labeled as
  unverified. GitHub remains authoritative for operation-specific permissions.

### Planned provider-managed GitHub webhooks

The existing endpoint registration and manual webhook flow remain supported.
GitHub-managed registration will be a separate lifecycle orchestration using
the workspace-owned GitHub credential and a provider adapter. The adapter only
speaks to GitHub's fixed API host; it must not log credentials, signing secrets
or provider response bodies. A remote webhook is mutable or removable only by
an identity recorded as owned by the corresponding Fluxora registration.

The lifecycle is not a single database transaction: GitHub may accept a write
while the response is lost. Before a remote create, persist a unique operation
intent and encrypted signing secret, then track a pending/unknown state and
reconcile before retrying. Do not claim an unknown webhook by URL alone, or
delete a webhook without verified ownership. GitHub 404 may mean missing access,
not necessarily absence. Persist enough state to recover safely after crashes,
competing requests, version changes, and partial updates. Publish, activation,
deactivation and rotation must not silently break an existing manual endpoint.
The UI should show the published version, connection status and actionable
permission errors. Automatic provider registration has not yet been wired to
activation; do not imply it is available until lifecycle and UI tests pass.
Construct callback URLs from an operator-configured public HTTPS API origin,
never from an untrusted request Host header or client-supplied URL. The adapter
does not itself establish that an arbitrary URL belongs to this deployment;
the orchestration must enforce that boundary before any GitHub request.

The provider adapter can inspect metadata for a previously recorded GitHub hook
ID and compare URL and events without exposing the provider's URL. An active,
matching response does not prove the signing secret matches: GitHub does not
return that secret. This primitive is not ownership discovery or a complete
reconciliation workflow.

The in-progress provider registration table pins an endpoint, credential and
workflow version and stores its signing secret encrypted. Atomic state updates
compare operation IDs and previous state; expired in-flight operations become
uncertain, never automatic retries. Database constraints protect known remote
identities and prevent deleting referenced endpoint, credential or version.
The lifecycle is separate from manual endpoint persistence and is composed by
an owner-scoped management service; manual endpoint UI remains compatible.
The orchestration must check ownership and version consistency itself; the
foreign keys alone do not prove that all records belong to the same workspace.

Manual endpoint edits reject an existing provider registration in any state.
The check runs while holding the workflow row lock; the future provider
registration creator must acquire the same lock before inserting its record,
otherwise a concurrent manual rotation can race the check. Removal and secret
rotation must go through a managed lifecycle once that lifecycle exists.

The GitHub create dispatcher claims CREATING as
CREATE_DISPATCHING atomically before a provider call. Only the winner sends;
unexpected failures are uncertain rather than automatically retried. A crash
or failed result persistence leaves dispatching state requiring recovery. The
owner-scoped management surface composes this dispatcher without exposing
provider tokens or signing material.

The unfinished delete dispatcher claims the stored provider identity, checks
remote URL, event and active status, and never treats an ambiguous DELETE or
GitHub 404 as confirmed removal. The GitHub inspection and delete are separate
requests and cannot guarantee the remote hook remains unchanged between them.
The dispatcher is exposed only through the owner-scoped management surface,
which returns safe status and keeps the manual endpoint compatible.

The recovery service is disabled by default and will run only when
`GITHUB_WEBHOOK_AUTOMATION_ENABLED=true` after migration and lifecycle release.
It marks bounded batches of stale create/delete dispatches uncertain, rechecking
state and timestamp to avoid overwriting a completed operation. It does not call
GitHub, reconcile unknown results, or resume reservations that never dispatched.
Production startup also requires `PUBLIC_API_ORIGIN` to be a trusted HTTPS
origin when the feature flag is enabled.

Workflow draft save and publish acquire the same workflow row lock used by
provider registration. Save rejects a stale draft pointer; publish rereads the
current draft after acquiring the lock and rejects any existing
provider-managed registration. This prevents a managed remote hook from being
silently left on an obsolete published version while preserving the existing
manual endpoint flow. The lifecycle now has an owner-scoped management surface:
`GET/POST/DELETE /workflows/:workflowId/provider-webhook`. The response contains
only safe state, repository/event metadata and timestamps; it never returns a
token, signing secret, callback URL or remote hook ID. The editor shows the
connection state while keeping manual setup available as a fallback. The
feature remains disabled by default until reconciliation and live-provider
qualification are complete.
