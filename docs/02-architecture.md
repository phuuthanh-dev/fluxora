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
apps/web: React UI only; never owns secrets or executes provider calls.
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

## Connector architecture

Each integration supplies:

- App manifest: stable app identity, label, icon, discovery category, and aliases.
- Operation manifest: stable node type, trigger/action/search/utility role,
  input/output schema, form fields, availability, and credential requirements.
- Backend executor: server-side implementation of the node contract.
- Optional mock resolver: deterministic output for test runs.

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
- Google Chat incoming webhook URLs are treated as secrets and deliver outward notifications via the notification dispatcher.
- Discord incoming webhook URLs are treated as secrets and deliver channel messages with SSRF validation, default-deny allowed mentions, and optional embeds via the notification dispatcher.
- Telegram Bot API delivers messages to typed destinations (DM, group, supergroup, or channel) configured at the node level using encrypted bot tokens; supergroups may include a topic/thread ID. Bot tokens are strictly redacted from URLs, logs, persisted execution states, and error messages; legacy credential chat IDs are supported as a deprecated fallback.
- Steam requests require API-key credentials and only expose data allowed by the configured API/public profile settings.
