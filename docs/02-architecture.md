# Architecture

## Jira privacy response — 2026-11-10

The existing reporting ledger retains credential/workspace IDs independently of
credential lifetime. Pending reviews live under existing Admin Support, with no
dedicated Privacy route or provider-specific navigation. Admin-only preview/response endpoints compose this ledger,
the vault and existing execution tables; no second engine or generic privacy
framework is introduced. Confirmed closed/updated responses block Jira credential
use. Reviewed erasure uses a signed, administrator-bound snapshot and serializable
transaction, blocks active work, clears all related terminal execution/node/item
payloads and removes connections/ledger while preserving state, timing and graphs.
`privacyErasedAt` prevents retries, including a race with erasure. Explicit inventory
backfill does not guess deleted legacy identities. Reporting recovery requires a
reviewed later provider cycle; no blind replay. Operational boundaries, retention
and copies outside this database are documented in `51-jira-privacy-response.md`.

## Data transforms and connector expansion — 2026-11-09

Aggregate, Split Out, Sort and Limit operate once on the incoming item stream
before the existing item runner persists results. Merge retains two named ports
and adds matching fields beside Append. No second engine or node version is
introduced. Settings for these list operations are fixed; field paths select
per-item values. Existing 100-item/1 MB limits and persisted redaction guards apply.
An empty reached stream can enter Aggregate; an unselected branch stays skipped.
Approval continuation reconstructs completed edge streams without replaying
providers. Approvals inside an item stream remain unsupported.

Notion data-source writes reuse the outbound/vault boundary, retrieve the current
schema, validate supported types and existing options, then send only selected
properties. Update verifies the page belongs to the selected data source.
Ambiguous write outcomes are not automatically retried.

GitLab uses a workspace PAT against gitlab.com. Its registration stores a separate
GitLab-generated signing token in the existing encrypted endpoint field. Ingress
checks Standard Webhooks HMAC, timestamp, project and event filters; the stable
`webhook-id` supplies the existing durable webhook execution idempotency key.
No new delivery table, worker or provider registration service is added. CI
variables are excluded from the normalized event. Only the additive GITLAB
credential enum migration is required; existing workflows and credentials are
not rewritten. Older binaries cannot execute the new node types.

References: [n8n Merge](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.merge/),
[Notion properties](https://developers.notion.com/reference/page-property-values),
[GitLab webhook signing](https://docs.gitlab.com/user/project/integrations/webhooks/).

## Account security extension (ACCOUNT-1)

AuthModule owns profile/session management, current-password changes and email recovery.
Platform administration is separate from workspace membership: the backend authenticates the existing session and compares its user ID to an operator-configured `PLATFORM_ADMIN_USER_ID`. An absent value fails closed; workspace ownership never grants platform access. Administrative queries select only the fields needed for operation and never return credentials or execution payloads. Administrators can revoke sessions and disable or re-enable sign-in; disabling revokes sessions and serializes with new login attempts, but does not stop workflows. Those actions are audited and do not delete workflows or credentials. Users cannot apply them to their own administrator account through the admin API.

Calendar polling records the time at which its initial baseline starts. For an event absent from the baseline's seen IDs, the provider creation time distinguishes an existing event that reappeared in incremental sync from a genuinely new event. The former is treated as an update, not a creation. A reset establishes a new baseline time; an ordinary deactivation/reactivation retains the existing one. Provider events without a valid creation time fail closed rather than producing a misleading creation.
AccountController validates requests, enforces same-origin JSON mutations and rate limits,
and returns stable errors without logging raw database/transport exceptions. AccountService
uses the existing User/Session/AuditLog models plus PasswordReset and AccountMail.
Password mutation and reset consumption lock the user row and commit together with
session/token invalidation and audit. Password login takes the same lock and rechecks
the verified password hash before creating a session, closing the old-password login race.

AccountMailService polls a durable PostgreSQL outbox in the API process, separate from
workflow execution and workspace credentials. A row is claimed before dispatch; its
message is encrypted with the existing vault, scrubbed after an attempt, and uncertain
dispatches are not retried automatically. SMTP remains opt-in through installation
configuration. No new Redis queue, workflow node or provider credential type is introduced.
Retention, activation and known boundaries: `docs/29-account-recovery.md`.

## System shape

### Item processing — owner-approved implementation in progress

The original runner associates one node record with each execution and node ID.
The owner has approved extending the runner toward n8n-style automatic item
processing. The initial scope is a bounded list-source → per-item action path,
not arbitrary graph cycles or binary storage. A list is an explicit connector
output contract, not every array found inside a payload. Each item needs a
stable identity, redacted observable state and expression context; individual
external writes must retain the existing uncertain-outcome and cancellation
boundaries. Recovery must not automatically replay an ambiguous write. This
paragraph records the intended change, not a claim that it has shipped.

Released in PR #94: item streams are associated with graph edges
so If and Switch can route each original item separately. Item outputs retain
their immediate parent link. Unselected paths do not run; joins, approvals and
action error branches on item paths remain rejected before execution.

Released in PR #95: an error branch on a list source
without item input uses the ordinary node-level runner before an item stream
exists. Malformed or over-limit source output follows that same branch. This
does not enable continuing after a failure within per-item processing.

Released in [PR #96](https://github.com/phuuthanh-dev/fluxora/pull/96): an action with a
connected Error output partitions per-item success and failure, retaining each
item's parent link. Its node record is failed if any item fails, while handled
failures can continue on their respective branches. Error output uses a generic
safe message and a coarse error code; detailed errors remain in the execution
inspector. Unknown internal errors and item count/size limit failures remain
fatal even with an Error output. Existing retry and uncertain-write rules apply.

The implementation stores bounded per-item state in `NodeExecutionItem`, with
links to the immediate parent item and redacted inputs and outputs. It processes
items sequentially; without a connected Error output, it stops on an error and marks unstarted items skipped. Lease
loss or cancellation does not replay an in-flight write. Before any node runs,
the runner rejects implicit item joins and approval nodes after a list. Explicit
Merge Append joins and handled action errors are supported. This subset has a maximum of 100 items and 1 MB of item data per
node; no exactly-once guarantee or automatic replay of successful writes is
implied. PR #94 passed verification and deployment checks; provider delivery
was not exercised by those checks.

### Two-input Append Merge (owner-approved 2026-11-09)

`action.merge` uses two named edge target handles (`input1`, `input2`), validated
in the shared graph contract, editor and API. Drafts may be incomplete; publish
and execution require exactly one connection on each port. No configuration
panel modes, extra queue, migration or version compatibility layer is introduced.

The existing longest-path ordering schedules both upstream branches before the
join. Only selected edges carry data; skipped branches contribute zero items.
Empty lists skip ordinary downstream actions and settle the next reachable
Merge. Append concatenates Input 1 then Input 2, with the existing combined
100-item/1 MB limit, sequential item history and immediate-parent provenance.
Unhandled errors stop the execution; handled Error items can enter Merge on a
separate port. An empty Merge succeeds with count zero and does not run actions
after it. Cancellation and lease fencing continue to govern every persisted item.

On approval continuation, completed source/item receipts reconstruct the selected
edge streams; providers are never replayed to reconstruct input. Restored items
carry the existing persisted-input redaction guard through Merge/conditions.
Expressions cannot consume redacted values as real input. Malformed stored input
fails closed. Approval *inside* an item stream remains unsupported; an approval
on a separate scalar branch can delay a join. A Merge is tested with the whole
workflow, because standalone node debugging has no two branch inputs.

Reference: [n8n Merge Append](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.merge/)
for ordered concatenation and waiting for inputs. This is a bounded two-input
subset; it does not claim n8n's other merge modes or complete execution parity.

### Delivery safety (NX-01)

An adapter's explicit retry decision is authoritative. The runner uses legacy
status/code inference only when no decision was recorded. Read-only requests and
confirmed 429 rejections retain bounded retries; ambiguous mutations (network
loss, timeout, 5xx or an unreadable success receipt) stop without automatic replay.
HTTP mutations, Drive uploads, Sheets writes, GitHub writes and notification
adapters follow this boundary. Existing Calendar reconciliation and MongoDB/Trello
write guards remain. This is not an exactly-once guarantee; a manual retry is a
new owner decision after checking provider state.

Local follow-up, pending validation: Drive uploads and Sheets writes request
manual redirect handling. A 3xx response is treated as an uncertain write and
is not replayed automatically, preventing 307/308 from forwarding the body.

SMTP success requires complete, consistent acceptance for the intended envelope.
`delivered: true` remains a legacy submission-accepted flag, with additive
`submissionStatus: "accepted"`, `acceptedCount` and `deliveryConfirmed: false`.
Partial/unconfirmed submissions fail without retry and expose counts, not SMTP
replies or recipient addresses. Only confirmed temporary rejection before DATA
may retry. See [Nodemailer's response contract](https://nodemailer.com/#response-object).

HTTP and Drive/Sheets bodies share the bounded streaming reader (1,000,000 bytes),
including providers without honest Content-Length. Oversize reads cancel the
stream and fail; no truncation is silently persisted as a complete response.
Unreadable write receipts never justify replay. Existing workflow JSON, successful
output keys and immutable versions are preserved; the retry change is a runtime
safety correction, not a graph/schema migration. AI request-cost policy, durable
Retry-After handling, registry/versioning and pagination are tracked separately;
their current implementation and verification state is recorded in
`docs/37-node-expansion-audit.md`.

MongoDB uses a dedicated workspace credential and TLS adapter. Every
socket uses guarded DNS lookup to reject private, loopback, link-local and
mixed public/private results. Guarded SRV seed discovery is supported; arbitrary
URI options, unrestricted topology discovery and certificate paths are not.
Owner-scoped metadata pickers use the same
guard. The adapter bounds document count, query time and output size. Insert
supports one bounded document and never retries an uncertain write automatically.

Google Chat OAuth uses its own provider and signed authorization state, scopes,
token and owner-scoped space discovery, independent of Drive/Sheets. The Chat
adapter calls a fixed API endpoint. Uncertain delivery is not automatically
retried; the user checks the destination before a manual retry. Live provider
configuration and verification are separate from local implementation.

Gemini text generation is a server-side node adapter with a separate `GEMINI`
vault provider and an owner-authorized model-list endpoint. The editor stores
model identifiers and prompt configuration, never the API key. Mock runs do not
read credentials or call Google; live execution uses the existing published
version and readiness/confirmation gates. The additive enum migration must run
before using the new credential provider. Provider qualification remains separate
from mock and transport tests.

OpenAI uses an independent `OPENAI` vault provider and owner-authorized model
list endpoint. Its Responses API adapter disables response storage, extracts
only assistant text, and returns sanitized incomplete or refusal failures. Its
additive provider enum migration is independent of Gemini. Provider retries may
incur repeated usage when an earlier response was lost; live qualification is a
separate controlled operator action.

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

Released in PR #97: after authorization, an SSE
subscription attaches to execution events and then sends a connection signal.
The editor uses this signal to refresh the execution snapshot on initial
connection and reconnect. This covers changes missed while the stream connects;
it does not replay Redis events lost while an SSE connection stays open.

`EXECUTION_WORKER_CONCURRENCY` bounds simultaneous jobs per worker and defaults to two (valid range: 1–20). Scale by adding workers first; readiness exposes the configured per-worker capacity and active queue count so an operator can see saturation.

Only the API process runs scheduler ingress. The worker starts the Nest application context for execution dependencies but identifies itself as `PROCESS_ROLE=worker`, which disables cron scheduling and prevents duplicate scheduled runs when workers scale horizontally.

Every active execution owns a short lease. The runner renews it while progressing nodes. BullMQ stalled-job replay is disabled for execution workers because a live provider may already have accepted a side effect. API maintenance marks a lease that expires as a terminal `EXECUTION_LEASE_EXPIRED` failure; a human may then explicitly retry with a fresh live confirmation. Maintenance also prunes terminal execution records by outcome-specific age and total count; waiting and running executions are never eligible.

Calendar event writes do not follow HTTP redirects. Update and delete failures
whose outcome is uncertain are terminal for automatic retry, including network
failure, redirects, timeouts, throttling and server errors. Event creation
uses a deterministic event ID and reconciles conflicts on ordinary retry; a
redirect still requires manual review. These boundaries do not guarantee that
an already-sent invitation or provider-side write can be cancelled.

For lease expiration, the execution claim and its running/pending node status
changes commit in one transaction, with the execution row locked first. A
database error rolls back the whole transition for a later scan; a compatible
NX worker cannot finish a node after the terminal transition. Maintenance
continues past individual failures and scans expired executions in bounded,
ordered batches. Provider requests already sent may still complete, and the
post-commit invalidation event is best-effort rather than a delivery guarantee.

The web dashboard is the authenticated control plane: it selects a workspace, lists workflows, and routes into a workflow-scoped editor URL. The editor distinguishes a deterministic mock test run from a guarded live run. Live requests use only `publishedVersion`; the API remains the final authorization and version-pinning boundary.

Workspace activity aggregates execution status in the API after owner
authorization, scoped through the workflow version to the selected workspace.
It counts retained test and live executions created within a rolling 24-hour
window and returns no payloads or secrets. It is a refreshable snapshot, not a
live stream or an all-time analytics store.

## Monorepo boundaries

```text
apps/web: React UI only; never stores saved provider credentials or executes provider calls. Owner-authorized credential summaries may include a fixed mask and two trailing characters for specifically allowlisted long opaque API keys/tokens; passwords, OAuth, webhook URLs and connection strings are excluded. Responses containing hints are not cacheable. A freshly generated webhook signing or header-auth secret is displayed once to the authenticated owner for manual sender setup and is not retrievable afterward.
apps/api: REST API, authentication, persistence, scheduler, node registry, worker.
packages/workflow-contracts: Shared graph DTOs, node metadata, expression types.
infra: Docker Compose, deployment scripts, and Nginx templates for the VPS runtime.
```

## Workflow model

`Workflow` owns metadata and current draft pointer. `WorkflowVersion` stores the graph snapshot as JSONB and is immutable once published. An `Execution` references `workflowVersionId`; a `NodeExecution` references `executionId` and `nodeId`.

Each node operation has one canonical type and one current execution behavior. The
legacy `.v2` type suffix and node-specific `nodeVersion` are not supported. Old
workflows using removed types must be recreated; existing unsuffixed nodes now
use current semantics, so review them before publishing or running them live.
No database records or credentials are deleted by this change. Workflow versions
and executions remain separate immutable snapshots as described above.
Node branch kinds come from the shared contracts package for both API graph
validation and editor handles.

Node configuration must be validated twice: once in the web editor for feedback and once in the API/worker as the trust boundary.

For If nodes, the resolved comparison operator must be supported; an unresolved or unsupported operator fails instead of silently using equality. Approval notification provider is a fixed publish-time choice because live readiness must check a credential of the corresponding provider. Runtime rejects unsupported choices and empty or unresolved expression results before waiting or notifying. Omitted choices use their documented defaults.

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

### Gmail read slice — historical implementation notes

Gmail uses a separate owner-scoped, encrypted `GMAIL` connection; its OAuth
consent requests `gmail.readonly` and does not replace Drive or Chat. That scope
is restricted and production access depends on Google review. The local Read
messages action exposes Inbox/Unread/All and optional Gmail query, returns at
most ten message headers, snippets and bounded plain-text bodies, and does not
load attachments. Results can be stored in execution history; explain this in
the connection UI. Mock runs never access credentials or mailboxes.

The new-message trigger is not implemented or exposed. It requires a durable
per-version mailbox checkpoint, concurrency-safe leasing, idempotent
enqueue/recovery, initial activation semantics, handling expired Gmail history
and lossless pagination before it can be advertised as reliable. A recurring
schedule plus Read messages is not a new-message trigger and must not be
described as one. No Gmail cloud scopes have been configured by this slice.

### Notion and PostgreSQL — historical notes from 2026-11-01

The owner requested both connectors. On the local development branch, a Notion
integration-token credential and page-search operation are being implemented;
only pages shared with that integration can be returned. This is not OAuth, nor
does it create or modify pages. Its additive credential enum migration is not
yet deployed. The PostgreSQL local slice includes its own credential,
schema/table discovery, a parameterized select builder and a bounded TLS read
node. The isolated TLS read and hostname-rejection checks, browser test and
full gate passed. Neither connector has been qualified with a real owner
credential or deployed; do not represent them as production-qualified.

The initial PostgreSQL target boundary rejects private or mixed DNS answers and
pins the selected public address while retaining the original TLS hostname. A
separate supported design is needed for private databases, and the read path
  was tested against an isolated server using a synthetic certificate.
Provider data must not enter logs or tests with real credentials.

PostgreSQL connections may optionally include an owner-supplied PEM CA chain
for providers whose roots are not in Node's default trust store. The API accepts
at most four valid CA certificates and 32 KB, encrypts them with the rest of
the connection, and adds them only to that connection's trust anchors. Both
certificate verification and hostname checking remain mandatory for discovery
and reads. Existing connections without a custom CA continue using Node's
default trust store. Supplying an untrusted CA changes what that connection
trusts, so the owner must obtain it directly from their database provider.

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

Operation metadata also classifies node-test behavior for the inspector and
describes the existing key-based execution-history filter. This description
does not execute mocks, enforce redaction, enumerate all secrets or replace
provider-specific checks. See `docs/46-node-configuration-schemas.md`.

The manifest is being consolidated incrementally. The shared contracts package
defines inspector-field descriptors for the 73 catalog entries that use the
declarative field renderer; the editor reads the same descriptors. Some core
nodes and Telegram destinations still use bespoke editor controls. Descriptors
are presentation metadata rather than a server-side validation schema. The
adapter remains authoritative for validation, credentials, redaction and retry.
An absent shared descriptor does not imply an operation has no configuration.

The server dispatches executable action node types through a typed,
server-only executor registry. The registration maps each persisted node type
to its current adapter. The runner
still rejects unavailable types first, and still applies its existing output
redaction and retry rules. Core triggers, conditions and approval remain in the
runner; a registry entry is not proof of complete provider coverage or a
replacement for the adapter's validation.

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
- `fetchSafeOutbound` also validates DNS answers at TCP connection time using
  its dispatcher, so a DNS change between URL validation and socket creation
  cannot silently select a private address. The operator's explicit hostname
  allowlist is still an exception. This is specific to that HTTP transport;
  SMTP, databases and direct `fetch` calls retain their own policies.
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
- Offline Google connector authorization must include a non-empty refresh token
  and a usable access-token expiry before a connection is created or replaced. If Google omits them, the callback
  fails without changing any existing credential. Previously stored tokens must
  not be combined with a new grant unless the Google account identity has been
  verified; retrying consent may be required. This guard does not repair a
  credential that was already saved without a refresh token.
- After validating signed state and the user session, a missing refresh token
  redirects to the fixed Connections route with the verified workspace ID and
  a non-secret status code. The page explains the failure and offers a retry;
  no authorization code, token or provider response is included in the URL.
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
permission errors. The managed lifecycle and reconciliation action are now
wired through the owner-scoped service and editor, but remain behind the
feature flag until production origin, migration and live-provider qualification
are complete. The UI must not present this as a guarantee that a remote hook
can always be discovered or repaired.
Construct callback URLs from an operator-configured public HTTPS API origin,
never from an untrusted request Host header or client-supplied URL. The adapter
does not itself establish that an arbitrary URL belongs to this deployment;
the orchestration must enforce that boundary before any GitHub request.

The provider adapter can inspect metadata for a previously recorded GitHub hook
ID and compare URL and events without exposing the provider's URL. An active,
matching response does not prove the signing secret matches: GitHub does not
return that secret. Reconciliation therefore only uses the recorded remote
identity: a matching active hook can restore an uncertain deletion to `ACTIVE`,
while drift, an ambiguous provider response, or an unknown identity remains a
manual boundary and never triggers a claim, create, or delete.

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

The delete dispatcher claims the stored provider identity, checks
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
`GET/POST/DELETE /workflows/:workflowId/provider-webhook` plus the explicit
`POST /workflows/:workflowId/provider-webhook/reconcile` action. The response
contains only safe state, repository/event metadata, timestamps and a bounded
reconciliation outcome; it never returns a token, signing secret, callback URL
or remote hook ID. The editor shows the connection state, a recorded-identity
verification action and keeps manual setup available as a fallback. The feature
remains disabled by default until production origin, migration and
live-provider qualification are complete.

## Google Calendar connector

The Calendar connector has a separate workspace-owned OAuth credential with
`calendar.events`, `calendar.events.freebusy`, and
`calendar.calendarlist.readonly`; it can list, read, create, update, and delete
events or check availability in a selected calendar. Event creation uses a
deterministic event ID and verifies a private marker after a conflict so retries
do not silently create duplicates within one execution. The event picker lists
up to 50 upcoming events and permits an ID/expression for other events. Update
only patches non-empty fields. A delete returning 404/410 is reported as absent
or inaccessible, not proven deleted. Mock mode uses synthetic events. A Calendar
trigger is not yet implemented. Event data may
appear in execution history.
OAuth consent configuration, live qualification and deployment are separate.

## Gmail new-message polling

Gmail Trigger uses a selected polling interval and Gmail history pages. The
first activation captures a mailbox-specific checkpoint; reactivation of the
same published version resumes the checkpoint, so messages received while
inactive may run. Per-message receipts and idempotent execution creation allow
retries without advancing a failed page. A periodic scan re-enqueues persisted
Gmail executions that remain queued when their Redis job has been lost; job IDs
and execution status claims prevent concurrent recovery from running them twice.
History expiration or a changed
mailbox enters an explicit error state. An owner-confirmed reset may discard
pending messages and cancels queued executions where possible. A version change
preserves the cursor and receipts for the same node and credential; changing or
removing the trigger requires explicit acknowledgement of a possible gap.
Polling intervals are selectable (one, five, 15 or 60 minutes), with 10, 25 or
50 messages per check; a backlog continues on later checks. Sender, subject and
label filters are evaluated using the message state when polled. History additions
marked `DRAFT` are skipped before fetching message content: Gmail can remove a
draft when it is sent. A missing non-draft message still requires review. Delivery
receipts currently have no automatic retention cleanup. Polling is not instant; Pub/Sub
push and real-mailbox qualification remain separate work.


### Google Drive pagination

The `action.google-drive` list and search operations return `operation`, `files`
and `nextPageToken` (null when absent). Requests are bounded to 100 files per
page; malformed or oversized continuation tokens fail instead of being dropped.
The bounded provider response reader remains in use.

In the inspector, changing the connection, operation or query clears a saved
page token. A token supplied via an expression or an imported/API-edited graph
must still be paired by the caller with the same connection, operation and
query: the opaque Drive token carries no locally verifiable context binding.
Google may reject expired tokens; clear and restart from page one. Concurrent
file changes can alter later pages. The reset does not rewrite published graph
versions. Validated top-level Drive output cursors are preserved in execution
history for continuation; input tokens and nested token fields remain redacted.
Gmail and Calendar list adapters likewise mark their validated top-level
continuation output for persistence; arbitrary or nested token fields remain
redacted. Tokens matching the current provider access token are rejected.
These changes have not been tested or qualified against a live provider.

### Steam news, notification settings and data mapping (local draft)

Steam news polling shares the existing feed checkpoint, delivery receipt,
lease and recovery paths. It derives a fixed public Steam API URL from a valid
App ID and requests at most ten items. No credential or new scheduler is used.
A non-overlapping snapshot stops polling for review; bounded retention means
old reappearing posts can be delivered again. This is polling, not a webhook.

Failure alert settings belong to the workflow rather than its immutable graph
version. A terminal live failure claims an alert once before sending through an
existing notification adapter. A claim does not prove provider delivery: a
process crash can lose an alert, and ambiguous writes must not be retried.
Credential reference checks include these settings. Slack uses its own vault
provider and incoming webhook adapter; the URL is never returned in a receipt.


Slack event ingestion reuses WebhookEndpoint, encrypted signing secrets,
transactional provider delivery identities, ExecutionQueue and queued-delivery
recovery. No new database table or runtime version is introduced. A challenge
is signed and accepted before workflow activation; event execution additionally
requires the current published version and a matching Slack workspace/channel.
Optional OAuth event permissions are explicit, not added to ordinary reconnect.


### PostgreSQL row writes

Insert and upsert reuse the PostgreSQL vault credential, public DNS resolution
and pinning, verified TLS, schema/table/column discovery and node executor
registry. Identifiers are strictly validated and quoted; values are bound as query
parameters. Writes are limited to one row and 50 supplied fields per item.
Upsert uses `ON CONFLICT` against one user-selected unique column included in
the row; PostgreSQL enforces the uniqueness constraint atomically. The server
does not silently retry after a query may have been sent. Execution output
contains only an acknowledgement and target names, not row values.


### Workspace-owned OAuth additions (2026-11-10)

Notion public OAuth reuses the Credential vault and existing Notion operations.
Callback state is browser/session/owner/workspace-bound. Reconnect checks workspace
and bot identity; only a definite 401 renews authorization under a database row lock
and retries once. Manual tokens and ambiguous-write failure behavior are preserved.

Managed Slack events enter one signed app endpoint, then route by provider-returned
app/team IDs to current active published workflow subscriptions in each workspace.
The existing durable delivery key and execution recovery avoid duplicate runs on
provider retry. See docs/48 for deployment prerequisites and current scale limits.
