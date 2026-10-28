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
| Google Chat | `Send webhook message` — action; OAuth message is roadmap | Webhook action implemented; OAuth action unavailable | `GOOGLE_CHAT_WEBHOOK`; Google OAuth `GOOGLE` is managed separately | Message textarea; credential select; OAuth node remains disabled | Live delivery and OAuth scope/callback qualification remain owner-gated |
| Discord | `Send webhook message` — action | Implemented through shared notification dispatcher | `DISCORD_WEBHOOK`, encrypted webhook URL | Content, username, avatar URL, embeds JSON, allowlisted mentions JSON | Real channel delivery and rate-limit smoke remain owner-gated |
| Telegram | `Send message` — action | Implemented through shared notification dispatcher | `TELEGRAM_BOT`, encrypted bot token only | Purpose-built destination type, chat ID, optional topic/thread ID, parse-mode select; legacy credential chat ID fallback | Real bot/chat authorization and channel/group smoke remain owner-gated |
| Google Drive | `Manage files` — action: list, search, upload text, download text | Implemented for configured operations | `GOOGLE`, OAuth or manual compatible credential | Operation select; download uses authenticated text-file picker; search/upload use operation-specific fields | Live OAuth scopes, shared-drive edge cases, and provider smoke remain owner-gated |
| Google Sheets | `Read or write rows` — action: read, append, update | Implemented | `GOOGLE` | Spreadsheet picker, operation select, range; values currently use a compact row editor | Live OAuth/resource qualification remains owner-gated; richer table mapping is a follow-up, not a blocker for current MVP |
| HTTP | `Make API request` — action | Implemented with SSRF policy, timeout and retry classification | Optional `HTTP` API-key/bearer/basic/header credential | Method select, URL, body, timeout; **headers were previously hidden in Advanced JSON and are closed by this slice with a key/value editor** | Production allowlist/egress policy and provider-specific API behavior remain deployment/operator concerns |
| Email | `Send email` — action | Roadmap/schema-only (`available: false`) | No runtime credential contract yet | Basic placeholder fields only | Must define provider strategy, credential, delivery adapter, redaction and live tests before enabling |
| OpenAI | `Generate text` — action | Roadmap/schema-only | No runtime credential contract yet | Model/prompt placeholder; model is currently free text | Must define API-key credential, model enum/resource behavior, token/error policy and executor before enabling |
| Gemini | `Generate text` — action | Roadmap/schema-only | No runtime credential contract yet | Model/prompt placeholder; model is currently free text | Must define Google AI credential/scopes, model selection and executor before enabling |
| MongoDB | `Query documents` — action | Roadmap/schema-only | No runtime credential contract yet | Database, collection and operation placeholders; operation is currently free text | Must define connection credential, safe query model, operation enum, limits and executor before enabling |
| GitHub | Triggers: issue opened, PR opened, push, workflow run completed; actions: create issue, add label, add comment, merge PR | Implemented; signed trigger delivery and guarded action calls | `GITHUB`, workspace connector token; separate from GitHub account login | Authenticated paginated repository picker; optional repository trigger filter; merge method select | Live webhook qualification, provider registration reconciliation, and owner/operator proof remain gated |
| Facebook Meta | `Manage content` — action | Roadmap/schema-only | No runtime credential contract yet | Operation placeholder only | Must define Meta OAuth/page-token model, asset/resource pickers and executor before enabling |
| Instagram | `Manage content` — action | Roadmap/schema-only | No runtime credential contract yet | Operation placeholder only | Must define Meta/Instagram account/media model, OAuth and executor before enabling |

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
5. Node output and errors use the common execution model: redacted I/O,
   normalized errors, timeout/retry classification, and success/error routes.

### Gaps found and disposition

| Gap | Decision | Status |
|---|---|---|
| HTTP runtime accepts `headers`, but the normal Inspector did not expose them | Add a reusable structured key/value field; preserve Advanced JSON compatibility | Fixed in `CONNECTOR-AUDIT-1` |
| Steam and Telegram contain provider-specific conditional controls outside the declarative field list | Keep purpose-built controls; these are not generic fields and are explicitly allowed by the node-library contract | Intentional; covered by editor tests |
| Google Drive changes fields based on selected operation | Keep conditional operation-specific controls and authenticated file picker | Intentional; covered by Google resource picker slice |
| Google Sheets values are compact row input rather than a full mapping table | Keep for MVP; promote to a table/mapping control only when a real workflow needs multi-row mapping | Follow-up, not a production blocker |
| Roadmap AI/database/social nodes have placeholder fields | Keep disabled; do not add fake runtime branches | Intentional roadmap boundary |
| Manual/expression entry remains for dynamic values | Retain hybrid behavior; providers cannot safely enumerate arbitrary runtime strings | Intentional and aligned with mature platforms |

## Required production qualification after this audit

The code contract is not the same as live provider proof. Before calling the
system production-ready, the release checklist still needs:

- one owner-approved live Steam → Google Chat execution;
- Google OAuth callback and Drive/Sheets resource discovery with the actual
  configured client;
- one owner-approved GitHub connector action and signed webhook delivery;
- Discord and Telegram delivery smoke tests using the workspace's own
  credentials;
- VPS DNS/TLS/env/readiness/rollback evidence from the operator runbook;
- a final audit that no test credential, token, webhook URL, or raw provider
  response appears in tracked files, browser state, logs, or execution history.

These are external-boundary checks and must not be simulated by changing the
catalog's `available` flags.
