# n8n Research and Adaptation Plan

**Research date:** 2026-10-24
**Purpose:** Use n8n as an architectural reference for this personal-first workflow platform. This is not a plan to replicate n8n feature-for-feature.

## Executive decision

The product should prioritize a reliable execution platform over a large node catalog. The existing product shape is sound: immutable workflow versions, encrypted credentials, persisted node I/O, retry/error routing, and a separate queue/worker abstraction already exist. The next work should harden those foundations before adding provider breadth.

Target operating scale remains small: roughly five users and 5–10 workflows a day. A single API process, PostgreSQL, Redis, and one worker are sufficient initially. The design must still support adding workers without changing workflow semantics.

## What n8n demonstrates

### 1. Separate control plane from execution plane

n8n queue mode has a main process receive triggers and create executions, Redis carry execution IDs, workers load execution data from the database, execute it, then persist results. Workers can be added or removed to scale. The main lesson is to keep HTTP/webhook ingestion and the editor responsive even when external integrations are slow.

Source: [n8n queue mode](https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/enable-queue-mode/).

**Adoption:**

```text
Webhook / cron / Go live
        ↓
API creates Execution pinned to a published WorkflowVersion
        ↓
Redis queue carries execution ID only
        ↓
Worker decrypts credentials, executes nodes, stores redacted results
        ↓
SSE updates the authenticated dashboard
```

The API and every worker must use the same `APP_ENCRYPTION_KEY`. A worker readiness endpoint must report both PostgreSQL and Redis availability.

### 2. Concurrency is a product control, not only an infrastructure setting

n8n applies production concurrency limits to avoid event-loop saturation and queues excess production executions. Manual runs are a distinct class from production trigger runs.

Source: [n8n concurrency control](https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/control-concurrency/).

**Adoption:**

- Separate `manual` from `live` execution modes.
- Enforce a small global live limit and an optional per-workflow limit.
- Show `queued`, `running`, and the configured capacity in the dashboard.
- On worker restart, reclaim expired work leases rather than leaving executions permanently `running`.

### 3. Execution data needs an explicit lifecycle

n8n allows different persistence policies for successful, failed, manual, and in-progress execution data, and prunes completed data by age or count. This protects the database from unbounded growth.

Source: [n8n execution data management](https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/manage-execution-data/).

**Adoption:**

- Preserve failed runs longer than successful runs.
- Keep waiting/running executions out of pruning.
- Use a background pruning job with age and maximum-count policies.
- Store only redacted, bounded-size node I/O. File and binary payloads remain out of scope until external object storage exists.

### 4. Debugging requires immutable replay choices

n8n exposes a project-aware executions list, filtering, previous execution data, and a choice to retry with either the original workflow or the currently saved workflow.

Source: [n8n all executions](https://docs.n8n.io/workflows/executions/all-executions/).

**Adoption:**

- The default retry uses the original pinned workflow version and original trigger payload.
- A deliberate `Retry with current published version` option is separate and clearly labelled.
- Execution detail must show attempt count, duration, redacted inputs/outputs, error code, and the exact version used.

### 5. Treat user-configurable outbound HTTP as a security boundary

n8n's SSRF controls block private, loopback, link-local, and reserved ranges; validate redirects and DNS resolution; and use explicit allowlists for legitimate internal hosts. It also stresses that network controls are the primary defense.

Source: [n8n SSRF protection](https://docs.n8n.io/deploy/host-n8n/configure-n8n/security/enable-ssrf-protection/).

**Adoption:**

- Centralize outbound URL validation for generic HTTP and every webhook-based connector.
- Reject non-HTTP(S), loopback, RFC1918, link-local, unspecified, multicast, and reserved addresses.
- Resolve hostnames before connection and re-check every redirect target.
- Do not persist outbound credential headers, provider URLs, or response bodies in error messages.
- Add infrastructure-level egress restrictions when deployed; application checks are defense in depth.

### 6. A reusable error workflow is more useful than per-node alert code

n8n supports an error workflow receiving structured execution failure context, which can send a shared alert for many workflows.

Source: [n8n error handling](https://docs.n8n.io/build/flow-logic/handle-errors-gracefully/).

**Adoption:**

- Keep node-level error edges and retry policy.
- Later add one workspace-level failure-notification workflow/target that receives a redacted error event.
- Error notification delivery itself must not recursively cause an alert loop.

### 7. Credential sharing must follow least privilege

n8n separates project/workflow sharing from credential permissions and prevents editing a node when its credential is not shared.

Source: [n8n workflow sharing](https://docs.n8n.io/workflows/sharing/).

**Adoption:**

- Current MVP owner-only workspaces are appropriate.
- When team support is introduced, model credential access explicitly; never infer it from workflow access.
- A user may run or view a workflow without seeing secret values.

### 8. Security posture needs a report, not only secure code

n8n's security audit detects unused credentials, risky nodes, unprotected webhooks, missing settings, and outdated software.

Source: [n8n security audits](https://docs.n8n.io/deploy/host-n8n/configure-n8n/security/run-security-audits/).

**Adoption:**

Add an owner-only runtime health/security page later with warnings for:

- missing or weak required deployment settings;
- active public webhooks without a secret;
- unused credentials;
- failed/revoked credential checks;
- queue, database, or worker unavailability;
- workflows with no execution retention policy.

### 9. Promotion through Git is a later-stage operational feature

n8n supports development and production instances connected through Git branches and recommends a directional flow to reduce accidental overwrites.

Source: [n8n environments and source control](https://docs.n8n.io/administer/use-source-control-and-environments/tutorial-create-environments-with-source-control/).

**Adoption:**

For now, workflow publishing and immutable versions are sufficient. When a production instance exists, use a `development` to `production` pull-request promotion flow. Export only workflow graphs, variable metadata, and credential references; never export encrypted credential values as a portability mechanism.

## Notification connector strategy

Do not build one overly-generic UI node. Build provider-specific nodes over a shared backend contract:

```ts
type NotificationAdapter = {
  provider: "google_chat" | "discord" | "telegram" | "email";
  send(input: NotificationMessage, credential: DecryptedCredential): Promise<DeliveryReceipt>;
};
```

Each provider has its own form and validation, while sharing redaction, retries, timeout, audit logging, and normalized delivery output.

| Provider | Credential | MVP node configuration | Notes |
|---|---|---|---|
| Google Chat | incoming webhook URL | message | Already present; use as the reference adapter. |
| Discord | webhook URL | content, embeds, `allowedMentions` | A webhook can post without a bot OAuth flow. Treat the full URL as a secret. [Discord webhook docs](https://docs.discord.com/developers/resources/webhook) |
| Telegram | bot token | chat ID, text, parse mode, silent flag | Keep bot token out of URLs/logs/persisted output. [Telegram Bot API](https://core.telegram.org/bots/api) |
| Email | provider/API credential | recipients, subject, body | Defer until notification adapter behavior is proven. |

**Delivery semantics:** A retry may occur after a provider accepted a request but before the client received its response. Cron ingress now uses a database-backed occurrence key and public webhooks accept an endpoint-scoped `Idempotency-Key`; failed execution retry reuses the immutable version and redacted trigger payload. Provider-level idempotency is still connector-specific: use an execution/node/attempt-derived idempotency identity where a provider supports it, and show a `delivery may have been duplicated` warning where it does not. The live retry confirmation now displays that warning.

## Delivery sequence

1. **Production Execution Foundation**: SSRF-safe egress, Redis worker qualification, live activation guard, concurrency, recovery, retention, health.
2. **Discord notification vertical slice**: encrypted webhook credential, node executor, deterministic mock, live confirmation, rate-limit/retry tests.
3. **Telegram notification vertical slice**: encrypted bot credential, send-message node, mock/live tests, safe error normalization.
4. **Operations dashboard**: workflows, executions, credentials, queue/worker health, failure trends, workspace switcher.
5. **Team and promotion controls**: projects, least-privilege credential access, development-to-production promotion.

## Explicit non-goals before real usage demands them

- Arbitrary JavaScript/Python execution.
- Community-node marketplace or plugin SDK.
- File/binary pipeline without object storage.
- Broad RBAC, SSO, and source-control UI.
- Full n8n compatibility or importing arbitrary n8n workflows.

These features are valuable only after execution safety and the core user journey are reliable.
