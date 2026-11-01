# Connector audit — pre-production baseline

**Audit date:** 2026-10-28
**Scope:** the complete source-owned catalog in
`apps/web/src/features/workflow/node-catalog.ts`, the execution dispatch in
`apps/api/src/execution/execution.service.ts`, live readiness in
`apps/api/src/execution/live-readiness.ts`, and the provider resource services.

This document is an implementation audit, not a claim that every listed app is
already production-ready. `available: false` is an intentional product
boundary: the node can remain visible for roadmap discovery, but cannot be
added or executed as an MVP runtime node.

## Architecture decision

Fluxora follows the mature automation-platform model:

```text
App / connector
  → concrete operation
    → typed trigger/action/search/utility behavior
      → reusable workspace connection
        → provider resource picker where enumeration is safe
```

The workflow graph stores the stable operation node type. Credentials are
workspace-owned and encrypted; they are selected by ID and are never placed in
the browser as secret payloads. A provider-specific node may use a shared
backend adapter, but the UI should not collapse unrelated provider operations
into one generic notification or “do everything” node.

Runtime capability is now an explicit shared contract: `workflowNodeTypes`
continues to include schema-only roadmap nodes for graph compatibility, while
`executableWorkflowNodeTypes` is the allow-list for current dispatch. The web
catalog parity test requires its available definitions to match that allow-list
exactly, and the execution boundary rejects a known-but-schema-only node before
provider dispatch. This keeps enabling a future app a deliberate vertical slice
across contract, catalog, fields, readiness, executor, and tests rather than a
single UI flag.

This matches the external products reviewed for this audit:

- n8n documents app nodes as collections of operations, with separate
  credential definitions and an HTTP Request escape hatch when a dedicated
  operation is unavailable. It also treats resource parameters as selectable
  provider data rather than requiring users to memorize IDs. See the
  [n8n MISP node operation model](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.misp/)
  and [n8n credential model](https://docs.n8n.io/integrations/builtin/credentials/).
- Make calls each concrete app operation a module, asks for a reusable
  connection, marks required fields, and supports mapping dynamic values from
  earlier modules. See [Make module types](https://help.make.com/types-of-modules)
  and [Make module settings](https://help.make.com/module-settings?hl=en).
- Zapier separates trigger/action/search steps, app connections, and a generic
  API/custom-action escape hatch. It explicitly distinguishes reusable app
  connections from credentials entered directly into a one-off webhook step.
  See [Zap structure](https://help.zapier.com/hc/en-us/articles/8496309697421-What-is-a-Zap)
  and [API request actions](https://help.zapier.com/hc/en-us/articles/12899473501453-API-Request-actions).

Therefore “Developer & DevOps”, “Communication”, and similar labels in Fluxora
are discovery groups, not new workflow types. The current catalog structure is
correct and extensible; the production requirement is contract parity and
provider qualification, not a larger UI taxonomy.

## Connector matrix

| App / connector | Catalog operations and category | Runtime status | Credential contract | Resource / field UX | Production gap |
|---|---|---|---|---|---|
| Steam | `Account snapshot` — action | Implemented; mock and live-capable executor | `STEAM`, encrypted API key plus Steam ID 64 fallback | Credential and Steam ID are purpose-built Inspector fields; include-owned/recent and achievement options are typed controls | Real Steam → notification smoke is owner-gated; Steam OpenID is identity linking only, not a workflow credential |
| Google Chat | Separate webhook and OAuth message actions | Implemented locally; provider qualification pending | `GOOGLE_CHAT_WEBHOOK` or separate `GOOGLE_CHAT_OAUTH` | Space picker with manual fallback and message field | Live OAuth scope/callback qualification and Google review remain separate |
| Discord | `Send webhook message` — action | Implemented through shared notification dispatcher | `DISCORD_WEBHOOK`, encrypted webhook URL | Content, username, avatar URL, embeds JSON, allowlisted mentions JSON | Real channel delivery and rate-limit smoke remain owner-gated |
| Telegram | `Send message` — action | Implemented through shared notification dispatcher | `TELEGRAM_BOT`, encrypted bot token only | Purpose-built destination type, chat ID, optional topic/thread ID, parse-mode select; legacy credential chat ID fallback | Real bot/chat authorization and channel/group smoke remain owner-gated |
| Google Drive | `Manage files` — action: list, search, upload text, download text | Implemented for configured operations | `GOOGLE`, OAuth or manual compatible credential | Operation select; download uses authenticated text-file picker; upload-only name/text fields are conditional | Live OAuth scopes, shared-drive edge cases, and provider smoke remain owner-gated |
| Google Sheets | `Read or write rows` — action: read, append, update | Implemented | `GOOGLE` | Spreadsheet picker, operation select, range, and reusable table editor for rows/columns | Live OAuth/resource qualification remains owner-gated; richer expression mapping is a follow-up, not a blocker for current MVP |
| HTTP | `Make API request` — action | Implemented with SSRF policy, timeout and retry classification | Optional `HTTP` API-key/bearer/basic/header credential | Method select, URL, body, timeout; **headers were previously hidden in Advanced JSON and are closed by this slice with a key/value editor** | Production allowlist/egress policy and provider-specific API behavior remain deployment/operator concerns |
| Email SMTP | `Send email` — action | Implemented with deterministic mock and guarded live transport | `SMTP`, encrypted hostname, TLS submission port, username, password and From address | SMTP credential selector; To/Cc/Bcc, subject, plain-text/HTML body and Reply-to fields; recipients stay on the node | One owner-approved Gmail submission reached its intended inbox; sustained and production delivery are unverified. No attachments, inbound mail, bulk sending, Gmail OAuth or vendor presets |
| OpenAI | `Generate text` — action | Implemented and verified locally | `OPENAI`, encrypted API key | Model discovery and prompt configuration | Real-provider testing deferred by owner; production behavior unverified |
| Gemini | `Generate text` — action | Implemented and verified locally | `GEMINI`, encrypted API key | Model discovery and prompt configuration | One owner-approved local model generation succeeded; other models and production behavior remain unverified |
| MongoDB | `Find documents` and `Insert document` actions | Direct TLS and bounded SRV seed selection implemented locally | `MONGODB` encrypted connection; fields or limited connection string | Database/collection pickers, guided Find conditions, advanced JSON and bounded results | Owner-approved SRV list and Find succeeded; live insert, mid-operation replica failover, private hosts, unsupported URI options and update/delete remain unqualified or unsupported |
| GitHub | Triggers: issue opened, PR opened, push, workflow run completed; actions: create issue, add label, add comment, merge PR | Implemented; signed trigger delivery, guarded action calls, and feature-flagged managed webhook lifecycle with recorded-identity reconciliation | `GITHUB`, workspace connector token; separate from GitHub account login | Authenticated paginated repository picker; optional repository trigger filter; merge method select; published-version webhook setup | Reconciliation is locally tested and never claims unknown hooks; live webhook/action qualification and owner/operator proof remain gated |
| Facebook Meta | `Manage content` — action | Roadmap/schema-only | No runtime credential contract yet | Operation placeholder only | Must define Meta OAuth/page-token model, asset/resource pickers and executor before enabling |
| Instagram | `Manage content` — action | Roadmap/schema-only | No runtime credential contract yet | Operation placeholder only | Must define Meta/Instagram account/media model, OAuth and executor before enabling |

### MongoDB implementation research — 2026-11-01

[n8n's MongoDB node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mongodb/)
separates document operations such as find, insert, update and delete from
its [MongoDB credential](https://docs.n8n.io/integrations/builtin/credentials/mongodb/),
which supports a connection string or individual connection values. For a
first Fluxora slice, use one encrypted workspace credential and separate Find
and Insert operations, with bounded results and execution time. Insert never
automatically retries an uncertain write; update/delete remain future work.
Use provider-backed database/collection selectors where permissions permit,
with manual/expression fallback and an explicit loading/error state.

MongoDB connection strings and replica discovery can cause connections to
multiple hosts; validating only the initial hostname is not sufficient to prove
that every connection respects Fluxora's outbound network boundary. Before
enabling runtime, establish a driver-compatible egress enforcement design,
credential/error redaction, TLS, resource limits, and deterministic mock and
integration coverage. The local connector resolves bounded SRV seeds, checks their parent
domain, validates each socket via guarded DNS, and connects directly to a
writable seed without following server-advertised topology. It does not offer
the driver's full replica-set failover. The [MongoDB driver connection options](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/)
describe separate connection, server-selection, socket and operation timeouts.

### Google Chat OAuth research — 2026-11-01

The existing Google OAuth connection requests Drive and Sheets scopes; it
does not authorize Chat. Google's [Chat authorization guide](https://developers.google.com/workspace/chat/authenticate-authorize)
lists `chat.messages.create` for posting as a user and `chat.spaces.readonly`
for listing spaces. The user-authenticated account must be a member of the
destination space. A Chat-specific authorization flow should request the
minimum required scopes separately, preserve existing Drive/Sheets credentials,
and use an authenticated server-proxied space picker with manual fallback.
Provider configuration, consent, scope verification and actual message delivery
are separate from local implementation; no existing Google consent settings
were changed in this research.

## Contract findings

### Correct and production-safe enough for the current MVP boundary

1. Every currently executable provider operation has a matching execution
   branch and live-readiness rule.
2. Roadmap nodes are visible but disabled, so the UI does not promise behavior
   that the backend cannot execute.
3. GitHub, Google, Discord, Telegram and HTTP credentials are selected by
   provider-aware selectors. GitHub and Google resources are server-proxied and
   return metadata only.
4. Provider-specific actions remain separate nodes while Discord, Telegram,
   Google Chat and approval delivery share the notification adapter contract.
   SMTP Email deliberately keeps its mail-specific envelope, subject and body
   contract instead of forcing those fields into the webhook-style adapter.
5. Node output and errors use the common execution model: redacted I/O,
   normalized errors, timeout/retry classification, and success/error routes.

### Gaps found and disposition

| Gap | Decision | Status |
|---|---|---|
| HTTP runtime accepts `headers`, but the normal Inspector did not expose them | Add a reusable structured key/value field; preserve Advanced JSON compatibility | Fixed in `CONNECTOR-AUDIT-1` |
| Steam and Telegram contain provider-specific conditional controls outside the declarative field list | Keep purpose-built controls; these are not generic fields and are explicitly allowed by the node-library contract | Intentional; covered by editor tests |
| Google Drive changes fields based on selected operation | Keep conditional operation-specific controls and authenticated file picker | Fixed in `CONNECTOR-FIELD-UX-1` |
| Google Sheets values previously used compact single-row input | Use a reusable table editor that persists the existing matrix payload | Fixed in `CONNECTOR-FIELD-UX-1`; expression mapping remains future work |
| Roadmap social nodes have placeholder fields | Keep disabled; do not add fake runtime branches | Intentional roadmap boundary |
| Manual/expression entry remains for dynamic values | Retain hybrid behavior; providers cannot safely enumerate arbitrary runtime strings | Intentional and aligned with mature platforms |

## Remaining production qualification after this audit

The code contract is not the same as live provider proof. Before calling the
system production-ready, the completed live smoke is recorded below and the
remaining release checklist is:

- Google OAuth callback and Drive/Sheets resource discovery with the actual
  configured client (read-only discovery is recorded; refresh-expiry and
  write semantics remain open);
- one owner-approved GitHub connector action and signed webhook delivery (a
  trigger-only signed Push qualification is recorded; action qualification
  remains open);
- VPS DNS/TLS/env/readiness/rollback evidence from the operator runbook;
- a final audit that no test credential, token, webhook URL, or raw provider
  response appears in tracked files, browser state, logs, or execution history.

These are external-boundary checks and must not be simulated by changing the
catalog's `available` flags.

The first owner-approved live smoke was attempted on 2026-10-28 and recorded a
Steam HTTP 403. After the workspace credential was rotated, a second
owner-approved run of published version 13 succeeded end-to-end for the
connected Steam, Google Chat, Discord, and Telegram nodes. Google Drive was
not part of that run because it is currently disconnected from the graph. The
full evidence is recorded in
[`2026-10-28-live-provider-smoke.md`](../.agent/reports/2026-10-28-live-provider-smoke.md).

SMTP Email is code-qualified; one owner-approved Gmail message reached the
intended inbox, as recorded in the 2026-11-01 snapshot in `19-agent-state.md`.
This does not establish sustained or production deliverability. It accepts only
public DNS hostnames, port 465 with TLS or 587 with required STARTTLS, enforces
certificate validation, caps connection/message inputs, never logs SMTP debug
traffic, and redacts credential/provider failure detail. The intentional
remaining risk is delivery uncertainty after a network interruption: SMTP has
no portable idempotency primitive, so a retry can be at-least-once. Operators
should use a sandbox mailbox before enabling automatic retries for workflows
whose messages must be unique.

## Current runtime evidence

The read-only follow-up in
[`2026-10-28-current-runtime-audit.md`](../.agent/reports/2026-10-28-current-runtime-audit.md)
confirmed public liveness/readiness and healthy production containers, but also
confirmed that the VPS image SHA differs from the current connector branch and
that the VPS checkout contains deployment/backup drift plus a running staging
stack. This is operational evidence only; it does not upgrade mocked connector
tests into live-provider proof or justify a final production Go decision.
