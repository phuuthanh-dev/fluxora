# Product Specification — Workflow Automation MVP

## 1. Product intent

Build an open-source workflow automation web application for personal use first. The MVP must be real, attractive enough for a portfolio, and structured to expand to small workspaces later.

Target usage is approximately five users and 5–10 executions per day. The MVP implementation window is three days. Therefore every feature below is categorized as **runtime**, **UI/schema only**, or **later**.

## 2. Primary success demo

```text
Cron (08:00 Asia/Ho_Chi_Minh)
  → Steam Account Snapshot
  → If profile is public
  → Google Chat: send daily Steam account report
```

The Steam profile is public. The Steam node returns every field available through the configured public Web API calls, not inaccessible/private account data.

## 3. Personas and access

- Initial user: a single owner who can sign in with email/password and, after OAuth is configured, Google identity.
- Data model: multiple workspaces and memberships must exist now.
- Authorization: only the owner role is active in MVP; role schema and audit logs prepare future expansion.
- Google identity sign-in is a production-preparation requirement. GitHub remains a visible roadmap affordance until its provider flow is implemented.

## 4. MVP feature scope

### Runtime nodes

| Category | Node | MVP behavior |
|---|---|---|
| Trigger | Manual | Start a test execution from the editor. |
| Trigger | Cron | Run published workflow by cron expression in `Asia/Ho_Chi_Minh`. |
| Trigger | Webhook | Receive JSON with optional secret header. |
| Condition | If/Else | Comparison operators and true/false paths. |
| Condition | Switch | Multiple cases and a default path. |
| Action | Steam Account Snapshot | Profile, current game, owned/recent games, playtime, and optional per-game achievements. |
| Action | Google Chat Webhook | Send formatted daily report into one space. |
| Action | Google Drive | List/search file metadata and upload/download text assets. |
| Action | Google Sheets | Read ranges, append rows, update ranges. |
| Action | HTTP Request | Generic REST request with structured response. |
| Approval | Approval | Pause, notify by Chat/webhook with an app link, then resume after UI approve/reject. |

### UI/schema-only nodes

- Email, including the configuration form and validation label `Not available in MVP`.
- Google Chat OAuth credential mode.
- OpenAI, Gemini, MongoDB, GitHub, Facebook Meta, Instagram.

### Explicitly out of scope

- User-provided JavaScript/Python execution.
- Loops, batch iteration, merge nodes, and sub-workflows.
- Connector marketplace/SDK.
- Production RBAC and multi-stage approvals.
- Mobile-first editor.
- Deployment and VPS setup.

## 5. Workflow editor requirements

- Desktop-first drag-and-drop graph editor.
- Node palette grouped into Trigger, Condition, Action, Approval.
- Zoom, pan, minimap, auto-layout, search, context menu, copy/paste, multi-select, undo/redo.
- Inspector panel for node configuration, validation, test data, and node result.
- A workflow has Draft and Published versions. Published versions are immutable.
- Export/import graph JSON, clone workflow, and create from template.
- A dashboard is the authenticated landing page. It lists workflows in the selected workspace, distinguishes draft-only from published workflows, and opens or creates workflows without an editor modal.
- The graph must be acyclic in MVP.

## 6. Data mapping and expressions

Each configurable value supports all three entry modes:

1. A structured form control.
2. A JSON editor.
3. A safe expression.

Expression example:

```text
{{ steps.steam.output.profile.personaname }}
{{ steps.steam.output.summary.topGames[0].name }}
```

The expression language must not evaluate arbitrary JavaScript. Support path access, interpolation, and a small approved helper set only. The UI provides autocomplete from sample and previous node outputs.

## 7. Executions

Each execution stores its pinned workflow version and has these states:

```text
queued → running → waiting_approval → succeeded | failed | cancelled
```

Each node execution stores:

- status: pending, running, succeeded, failed, skipped, waiting
- attempt count and duration
- redacted input and output
- normalized error `{ code, message, retryable }`

Action nodes support timeout, retry with exponential backoff, and an error edge. Retry only network, timeout, 429, and 5xx-like failures; do not retry invalid configuration or authorization failures by default.

## 8. Credentials and integrations

- Support multiple credentials per provider.
- Steam Account Snapshot: API key plus Steam ID 64. Steam OpenID is an optional identity-link flow only; it does not replace the API credential.
- Google Drive and Sheets: Google OAuth 2.0 authorization-code flow handled by the backend, with encrypted refresh tokens.
- Google account sign-in: a separate OpenID Connect authorization-code flow that links a verified Google subject to the app user. It never stores Drive/Sheets access tokens as account-login state.
- Google Chat MVP: incoming webhook URL credential.
- Generic HTTP: API key, bearer token, basic auth, or headers.
- All credential values are encrypted at rest and never returned to the client after save.

Google OAuth must use incremental, least-privilege scopes. Google Drive and Sheets share a Google credential when appropriate.

## 9. Approval behavior

Approval pauses the workflow and creates an expiring approval request. It may notify via Google Chat or an outgoing webhook. Google Chat incoming webhooks are notification-only, so the human approves or rejects on the app's approval page; generic callback webhooks may also resume an approval.

No multi-approver routing, reminder schedule, or approval policy engine is included in MVP.

## 10. UX and observability

- Minimal, professional visual style with dark-mode-ready tokens.
- Smooth but restrained graph and status animations.
- Realtime execution updates using WebSocket or SSE.
- Input/output views: JSON tree, table, raw text.
- Mock run mode uses fixtures and calls no third-party API.
- **Go live** is available only after publish and always requires an explicit confirmation. It executes the immutable published version, never the editable draft, and warns of real external side effects.
- Redact secrets from UI and persisted logs.
- Audit login, credential changes, workflow publish/unpublish, and execution actions.

## 11. Acceptance criteria

1. User can create a workspace and workflow, then save a draft and publish it.
2. User can add/configure/connect nodes and receives realtime validation feedback.
3. Manual, cron, and webhook triggers can create executions.
4. The Steam-to-Google-Chat demo sends a real daily report.
5. The execution inspector shows every node's redacted input, output, status, retries, and duration.
6. A failed HTTP/action node observes timeout/retry/error-branch rules.
7. Approval pauses and resumes the pinned execution version.
8. Workflow export/import, clone, version history, and sample-data test runs work.
9. No secret is present in repository history, logs, API responses, or frontend state.
10. The dashboard supports switching/creating workspaces and creating/opening workflows; a live run is guarded by publish and confirmation.
11. A signed-in user can link a Steam OpenID identity when the callback endpoint is configured; linking neither exposes nor creates a Steam Web API credential.
