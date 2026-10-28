# Connector audit — 2026-10-28

Snapshot: main `16d53a5`; PR #32 and `codex/github-webhook-automation` are separate work, not main. Evidence is the catalog, inspector, executor, credential services, provider-specific tests and documented live checks. “Available” means implemented, not fully qualified for production.

| App | Current capability and classification | Configuration and evidence | Gap / next step |
|---|---|---|---|
| GitHub | Four event triggers and four action operations; manual signed webhook registration | Repository resource picker and credential; tests; one live Push trigger-only execution succeeded | PR #32 owner clarity pending; automatic provider lifecycle is incomplete on a separate branch. Actions not live-qualified. |
| Steam | Account snapshot action, not a trigger | API key/Steam ID credential, identity override, owned/recent games, achievement app ID; simple fields use the shared inspector contract; live Steam→Chat execution reported | No claim that Steam OpenID is an API credential; no automatic event subscription. Verify other options and provider limits as needed. |
| Google Chat | Incoming webhook send action | Separate webhook secret and message; notification adapter | OAuth action marked unavailable; no Chat trigger. Live Steam→Chat execution reported. |
| Discord | Incoming webhook send action | Webhook credential, content, username, avatar, embeds and mention-policy JSON; adapter tests | Rich field editors and live delivery qualification need separate scope; webhook URL is a secret. |
| Telegram | Bot send action | Bot token, typed destination, chat ID, optional topic ID, text and parse mode; adapter tests | Destination requires user-provided ID; no Telegram trigger or automatic registration. Live delivery and handling of formatting errors need qualification. |
| Google Drive | One action exposing list/search/upload text/download text operations | Google OAuth credential, text-file picker and operation-specific data; real OAuth and read-only picker discovery succeeded | UI originally showed unrelated upload fields and search query for other operations; this slice makes visibility operation-aware. All-file Drive scope is restricted; refresh expiry, file actions and verification remain. |
| Google Sheets | One action exposing read/append/update rows | Google OAuth, spreadsheet picker, range and one-row comma-separated editor; real OAuth/read-only picker discovery succeeded | Hide values during reads. Comma-splitting is not a general CSV or multidimensional editor; avoid claiming full Sheets parity. File writes and token-expiry recovery remain unverified. |
| HTTP | Generic request action | Optional vault credential, method select, URL, body, timeout; headers in advanced JSON; safe outbound policy | Improve structured headers/body configuration in a separate slice; live provider-specific behavior depends on target. |
| Email | Roadmap-only action, unavailable | Placeholder fields | No delivery adapter/credential; do not present as production-ready. |
| OpenAI / Gemini | Roadmap-only actions, unavailable | Placeholder model/prompt | No live executor or credential lifecycle; validate current provider APIs before implementing. |
| MongoDB | Roadmap-only action, unavailable | Placeholder database/collection/operation | No executor/credential or safe query mapping. |
| Facebook Meta / Instagram | Roadmap-only actions, unavailable | Placeholder operation | No connector execution or OAuth lifecycle; platform policy and permissions need separate research. |

On the in-progress `codex/connector-config-audit` branch, the Sheets editor has
been changed from comma splitting to individual cells supporting multiple rows
and columns, with confirmation before removing the final row or column. The
main-branch limitation in the table remains until reviewed and merged. Editing
one cell preserves other cells and their stored types; it does
not make the connector equivalent to all Google Sheets node operations.

The comparison is about interaction patterns, not feature parity: n8n groups Drive operations by resource and operation ([Drive](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledrive/)); Sheets likewise distinguishes document and sheet operations ([Sheets](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/)); Telegram has separate action and trigger capabilities ([Telegram](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.telegram/)). Not all providers expose discoverable destinations or need webhook registration. Do not apply GitHub's model indiscriminately.

Release gates remain: provider-specific live qualification with explicit owner approval; Google Testing-mode refresh expiry and OAuth verification; monitoring and restore/rollback evidence. The owner previously deferred backup, so do not silently reinstate it. Prioritize data integrity and operation-specific fields before expanding provider count.

## Connector shape and field-contract verdict

The connectors are not all expected to match GitHub one-for-one. The current
shape follows the provider interaction rather than a single universal node:

| Shape | Connectors | Verdict |
|---|---|---|
| Separate trigger/action nodes | GitHub event triggers and GitHub actions; Manual, Cron, Webhook, Approval | Correct: the event boundary, permissions, and execution semantics differ. |
| One app node with an operation selector | Google Drive and Google Sheets | Correct for the current scope: the credential/resource stays stable while the operation changes the fields. This is the same resource/operation pattern used by n8n. |
| Separate provider notification action | Google Chat webhook, Discord webhook, Telegram message | Correct: each provider has a different credential and payload contract; they share backend adapter/error behavior, not a misleading generic UI node. |
| Provider action with bespoke fields | Steam account snapshot and Telegram destination controls | Correct where the provider needs identity/destination guidance. Steam's simple fields now use shared metadata; Telegram keeps conditional destination hints as a bespoke control. |
| Generic action | HTTP request | Correct to keep URL and request details user-configurable. A generic HTTP node cannot safely offer a provider resource picker for arbitrary destinations; headers/body structured editors are a later UX slice. |
| Roadmap-only nodes | Email, Google Chat OAuth, OpenAI, Gemini, MongoDB, Meta, Instagram | Correctly marked unavailable. They must not receive a fake credential or live-readiness contract until their provider adapter and credential lifecycle exist. |

Field audit rules now enforced in code are: stable operation metadata for every
catalog entry; credential selection for executable credential-backed nodes;
resource pickers only where a safe owner-scoped provider listing exists; static
enums rendered as selects; and boolean Steam options rendered through the
shared inspector field contract. Telegram chat IDs and HTTP URLs remain manual
by design, with provider-specific guidance or generic-target semantics rather
than invented discovery APIs.

This audit is an interaction/contract check, not a production qualification.
Mock tests do not prove OAuth refresh, provider permissions, remote webhook
ownership, or live delivery. Those remain explicit release gates.
