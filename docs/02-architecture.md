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

The web dashboard is the authenticated control plane: it selects a workspace, lists workflows, and routes into a workflow-scoped editor URL. The editor distinguishes a deterministic mock test run from a guarded live run. Live requests use only `publishedVersion`; the API remains the final authorization and version-pinning boundary.

## Monorepo boundaries

```text
apps/web: React UI only; never owns secrets or executes provider calls.
apps/api: REST API, authentication, persistence, scheduler, node registry, worker.
packages/workflow-contracts: Shared graph DTOs, node metadata, expression types.
infra: Docker/local service definitions, added after the MVP foundation.
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

- Node manifest: label, category, icon, input/output schema, form fields, and credential requirements.
- Backend executor: server-side implementation of the node contract.
- Optional mock resolver: deterministic output for test runs.

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
- Use allowlisted expression helpers; never execute user JavaScript.
- Restrict CORS to the web application origin.

## Persistence model

Core tables: `users`, `sessions`, `workspaces`, `workspace_members`, `workflows`, `workflow_versions`, `credentials`, `executions`, `node_executions`, `approval_requests`, `webhook_endpoints`, `audit_logs`, `workflow_templates`.

JSONB is appropriate for workflow graph/configuration and node I/O; relational columns handle IDs, ownership, status, timestamps, and common filters.

The MVP pins Prisma ORM 6.12.0 because the local Node 23 runtime is outside Prisma ORM 7's supported LTS range and the later 6.16.x CLI dependency tree has unresolved audit findings in this environment. Upgrade Prisma together with the runtime after the MVP; do not mix major Prisma client/CLI versions.

## External API notes

- Google OAuth callbacks occur on the API server, not the web app.
- Google Drive/Sheets use a shared OAuth credential where scopes allow it.
- Google Chat incoming webhook URLs are treated as secrets and only send outward notifications.
- Steam requests require API-key credentials and only expose data allowed by the configured API/public profile settings.
