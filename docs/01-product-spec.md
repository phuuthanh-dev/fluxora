# Product Specification — Fluxora MVP

Owner update, 2026-11-01: the workspace connection list may show a fixed mask
plus at most two trailing characters of specifically allowlisted long opaque
API keys/tokens, to help identify an existing connection. This is only a hint,
not proof of validity. Passwords, OAuth credentials, webhook URLs, connection
strings, short or non-opaque values are excluded. The full stored value is
never returned. See `docs/35-connector-coverage-and-discovery.md`.

## 1. Product intent

Build Fluxora, an open-source workflow automation web application for personal use first. The MVP must be real, attractive enough for a portfolio, and structured to expand to small workspaces later.

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

- Initial user: a single owner who can sign in with email/password and, after OAuth is configured, Google or GitHub identity.
- Data model: multiple workspaces and memberships must exist now.
- Authorization: only the owner role is active in MVP; role schema and audit logs prepare future expansion.
- Google and GitHub identity sign-in are production-preparation requirements. The two providers share the external-identity model but use independent OAuth callbacks and credentials.
- Owner-approved ACCOUNT-1 (2026-10-30): `/settings/account` edits the display name, changes the password with current-password verification, and lists/revokes the user's active sessions. Email is read-only; existing identity links remain separate from workflow connections.
- `/forgot-password` and `/reset-password` use operator-configured system email, not workspace SMTP credentials. Links expire in 30 minutes, work once, and invalidate outstanding links and all sessions. Passwordless social accounts may set a password by verifying access to their account email. No automatic sign-in follows recovery. See `docs/29-account-recovery.md` for security, configuration and activation boundaries.

## 4. MVP feature scope

### Runtime nodes

This table records the MVP baseline and selected later additions. Entries marked
**local draft** are not evidence of release or live-provider qualification.

| Category | Node | MVP behavior |
|---|---|---|
| Trigger | Manual | Start a test execution from the editor. |
| Trigger | Cron | Run published workflow by cron expression in `Asia/Ho_Chi_Minh`. |
| Trigger | Webhook | Receive JSON with optional secret header. |
| Trigger | GitHub Issue opened | Receive a signed GitHub `issues` webhook with `action: opened` using the registration signing secret. |
| Trigger | GitHub Pull request opened | Receive a signed GitHub `pull_request` webhook with `action: opened` using the registration signing secret. |
| Trigger | GitHub Push | Receive a signed GitHub `push` webhook using the registration signing secret. |
| Trigger | GitHub Workflow run completed | Receive a signed GitHub `workflow_run` webhook with `action: completed` using the registration signing secret. |
| Trigger | Gmail new message | Poll Gmail history with a workspace-owned connection, selectable interval and optional sender/subject/label filters. Released in PR #57; one targeted local poll succeeded. Sustained polling and Google scope verification remain open. |
| Trigger | RSS new item | Code on `origin/main` polls a feed using a checkpoint and bounded recovery. Provider availability and gap handling still need qualification. |
| Condition | If/Else | Comparison operators and true/false paths. |
| Condition | Switch | Multiple cases and a default path. |
| Action | Steam Account Snapshot | Profile, current game, owned/recent games, playtime, and optional per-game achievements. |
| Action | Steam Web API | Community-node parity for profile, friends, badges, vanity URL, owned games, recently played games, and per-game achievements. The game picker lists visible owned games with a manual App ID fallback. Uses a workspace Steam Web API key; privacy settings still apply. |
| Action | Riot TFT | Local prototype for Riot ID/account lookup, TFT match IDs, match detail, ranked entries and service status using an eligible workspace Riot key. Production approval and live TFT qualification remain open. |
| Action | Google Chat Webhook | Send formatted daily report into one space. |
| Action | Discord Webhook | Send content, embeds, and an explicitly allowlisted mention policy into a Discord channel via incoming webhook. |
| Action | Telegram Message | Send message via Telegram Bot API with bot token and a typed destination: DM, group, supergroup, or channel. Supergroups may optionally target a topic/thread. |
| Action | GitHub Create Issue | Create an issue with a workspace-owned GitHub connector credential; an optional idempotency key reuses a previously created issue. |
| Action | GitHub Add Label | Add one label to an existing issue with the same workspace-owned GitHub connector credential. |
| Action | GitHub Add Comment | Post a comment to an existing issue with the same workspace-owned GitHub connector credential. |
| Action | GitHub Merge Pull Request | Merge an existing pull request with an explicit merge method using the same workspace-owned GitHub connector credential. |
| Action | Google Drive | List/search file metadata and upload/download text assets. |
| Action | Google Sheets | Read ranges, append rows, update ranges. |
| Action | HTTP Request | Generic REST request with structured response. |
| Action | SMTP Email | Dedicated encrypted SMTP credential, TLS-only submission and normalized delivery result. One owner-approved local submission reached the intended inbox; production delivery and sustained behavior remain unqualified. |
| Action | Gmail Read | Read bounded inbox results using a dedicated Gmail connection. Released in PR #57; one targeted local read succeeded. Google scope verification and sustained behavior remain open. |
| Action | Gmail message and draft operations | Code on `origin/main` supports getting a message, sending or replying, creating or updating a draft, and modifying labels. These operations need their corresponding Gmail permissions; no new live qualification is implied. |
| Action | Google Calendar | List, get, create, update and delete events or check availability using a dedicated Calendar connection. Released in PR #57; bounded local tests cover these modes, with a far-future list anomaly and production qualification still open. |
| Action | Gemini Generate Text | Dedicated workspace API-key connection, model discovery, prompt and bounded output, with mock and confirmed live modes. |
| Action | OpenAI Generate Text | Dedicated workspace API-key connection, model discovery and Responses API text output, with mock and confirmed live modes. |
| Action | MongoDB Find / Insert document | Dedicated credential, public single-server TLS, bounded data and database/collection pickers with manual fallback. |
| Action | Google Chat OAuth message | Dedicated Chat OAuth connection and space picker, sending on behalf of the consenting user. |
| Action | Notion Search pages | Search accessible pages using a dedicated connection; other Notion operations are not implied. |
| Action | PostgreSQL Select rows | Read bounded rows with a dedicated connection and verified TLS; an optional provider CA is supported. |
| Action | RSS Read feed | Read bounded RSS or Atom entries over guarded outbound HTTP. |
| Action | Trello Create card | Create a card in a chosen board and list using a workspace connection. |
| Action | Sentry List issues | Read issues from an accessible Sentry project. |
| Action | Vercel List deployments | Read deployments for an accessible project, with a personal-account fallback when team discovery is denied. |
| Action | Supabase Select rows | Read bounded rows from an accessible public-schema table using Data API permissions. |
| Action | Supabase Insert row | **Local draft:** insert one public-schema row using guided typed column values and the workspace connection; the API receipt does not return the inserted row. |
| Action | Reddit List posts | List public posts only when provider access is available; real access has not been qualified. |
| Trigger | Uptime Kuma alert | Receive and normalize an authorized monitor alert; local UP/DOWN delivery was tested. |
| Approval | Approval | Pause, notify by Chat/webhook with an app link, then resume after UI approve/reject. |

PostgreSQL and Supabase select nodes preserve historical behavior under their original types, even when saved graphs have no node version. New selections use distinct v2 node types. Upgrading an older node is an explicit draft edit; its previously ignored selection fields can change results and unsupported extra fields may need manual correction. The published workflow changes only after publishing the draft.

See `docs/35-connector-coverage-and-discovery.md` for the exact operations, point-in-time live evidence, provider restrictions and remaining coverage. An executable node is not a claim of full provider feature parity.

### Not yet implemented or outside current runtime scope

- Gmail attachments and push notifications are unavailable. Gmail send/reply and draft/label operations need appropriate Google permissions and remain subject to provider qualification.
- MongoDB update/delete, unrestricted replica topology discovery, remaining GitHub operations, Facebook Meta and Instagram remain unavailable. Guarded SRV seed discovery is implemented for the existing MongoDB operations; this is not unrestricted replica discovery.
- VALORANT, Legends of Runeterra and 2XKO player data are planned, not executable: their relevant Riot approval and player opt-in/RSO requirements have not been fulfilled.

### Explicitly out of scope

- User-provided JavaScript/Python execution.
- Loops, batch iteration, merge nodes, and sub-workflows.
- Connector marketplace/SDK.
- Production RBAC and multi-stage approvals.
- Mobile-first editor.
- Deployment and VPS setup were outside the original three-day MVP; the later production deployment and its qualification limits are tracked in `docs/15-deployment.md` and `docs/35-connector-coverage-and-discovery.md`.

Notion page search retains its existing single-request behavior by default.
The existing paginated node may opt in to collecting additional provider pages,
up to the configured maximum of 100 returned pages and at most five requests.
The output retains `hasMore` and `nextCursor` if more results may be available.
This is bounded pagination within one node, not workflow item iteration or an
unlimited “return all”; provider ordering and results may change between calls.
Google Drive list/search also retains its original single-request default and
can opt in to at most five requests and 100 file results; an available
`nextPageToken` is returned for continuation. This does not guarantee a
complete search, and it does not affect uploads or downloads.
Gmail read similarly offers optional bounded collection within its existing
maximum of ten messages: at most five list requests plus a detail request for
each message. It retains a continuation token when more results may exist. It
does not change the Gmail polling trigger or its checkpoint.

## 5. Workflow editor requirements

- Desktop-first drag-and-drop graph editor.
- Add Node library separates core workflow primitives from apps. Apps are selected
  before their trigger/action/search/utility operation; search spans both levels,
  and purpose categories are discovery metadata rather than persisted workflow
  semantics. See `docs/16-node-library-information-architecture.md`.
- Zoom, pan, minimap, auto-layout, search, context menu, copy/paste, multi-select, undo/redo.
- Inspector panel for node configuration, validation, test data, and node result.
- A workflow has Draft and Published versions. Published versions are immutable.
- Export/import graph JSON, clone workflow, and create from template.
- The public root route is a product landing page. The dashboard is the authenticated control-plane home: it lists workflows in the selected workspace, distinguishes draft-only from published workflows, and opens or creates workflows without an editor modal.
- Owners can view archived workflows in their workspace and restore them with
  draft, published versions and execution history intact. A restored workflow
  remains inactive until explicitly activated again.
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

Provider configuration must not default to manual text when the provider can
enumerate a safe resource. Use a bounded select for enum values, an
authenticated searchable resource picker for provider resources such as
repositories/files/spaces, and a hybrid expression field for values produced
at runtime. Resource pickers return metadata only and persist stable provider
identifiers; credentials and provider tokens remain server-side.

GitHub webhook registrations have a per-workflow signing secret independent of
the reusable API connection. The newly generated secret is returned once to the
authenticated workspace owner in a non-cacheable response at creation or
rotation; later reads never return it. Rotating an existing registration requires updating GitHub. Existing endpoints
continue accepting their legacy connection secret until rotated.
Generic webhooks may require an `x-workflow-secret` header; when enabled, the
generated secret follows the same one-time, non-cacheable display rule.

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

Action nodes support timeout, retry with exponential backoff, and an error edge.
An explicit adapter retry denial always wins over status/code inference. Transient
reads and confirmed temporary rejections may retry; ambiguous writes must stop
without automatic replay, including loss of a successful receipt and rejection
after a redirect. The owner checks provider state before manually retrying.
Invalid configuration and authorization failures are terminal by default.
HTTP and Drive/Sheets response bodies have a streaming 1,000,000-byte limit.
SMTP success means all envelope recipients were accepted for submission, not
confirmed inbox delivery; partial/uncertain submission fails without auto-retry.
Existing SMTP `delivered` stays compatible and gains explicit submission metadata.

## 8. Credentials and integrations

- Support multiple credentials per provider.
- Steam Account Snapshot: API key plus Steam ID 64. Steam OpenID is an optional identity-link flow only; it does not replace the API credential.
- Google Drive and Sheets: Google OAuth 2.0 authorization-code flow handled by the backend, with encrypted refresh tokens. The shared managed connection requests full Drive and Sheets scopes; resource selection happens in node configuration, not during consent.
- Google account sign-in: a separate OpenID Connect authorization-code flow that links a verified Google subject to the app user. It never stores Drive/Sheets access tokens as account-login state.
- GitHub account sign-in: an OAuth 2.0 authorization-code flow that links a GitHub subject with a verified email to the app user. It requests only `read:user` and `user:email`, and never persists the provider access token as account-login state.
- GitHub connector: a separate workspace-owned token credential for workflow actions. `Create Issue` calls the GitHub REST API from the backend; an optional idempotency key is hashed into an HTML comment marker and searched before creation because GitHub's Issues API does not provide a native idempotency key.
- GitHub `Add Label` calls the issue-labels endpoint with the same workspace-owned token, returns the provider's normalized label set, and uses the shared timeout/retry/error contract. It is intentionally a separate operation node from `Create Issue`.
- GitHub `Add Comment` calls the issue-comments endpoint with the same workspace-owned token, returns the normalized comment identity and body, and uses the shared timeout/retry/error contract. It is intentionally a separate operation node from issue creation and labeling.
- GitHub `Merge Pull Request` calls the pull-request merge endpoint with the same workspace-owned token and an explicit `merge`, `squash`, or `rebase` method. The action remains subject to the existing live-run confirmation boundary and normalizes the provider merge result.
- GitHub `Issue opened`, `Pull request opened`, `Push`, and `Workflow run completed` verify `X-Hub-Signature-256` against the raw body using the endpoint registration's signing secret, then filter the configured event and action before execution. Legacy endpoints continue using the connector's `webhookSecret` until rotated. GitHub account-login OAuth is never used for verification.
- Google Chat MVP: incoming webhook URL credential.
- Google Chat OAuth is a separate workspace connection requesting space listing
  and message creation; it never replaces Drive/Sheets credentials. API enablement,
  scope verification and live qualification remain separate.
- MongoDB uses a public DNS hostname, port and user authentication; guarded
  SRV seed discovery is also supported for the existing find/insert operations.
  TLS validation and connection-time DNS checks are mandatory. Find is bounded
  to 100 documents and 200 KB, rejects server-side JavaScript and has bounded
  connection/operation time. Insert accepts one JSON document up to 200 KB and
  uncertain writes are never automatically retried. Private hosts, unrestricted
  replica topology discovery, update/delete and custom TLS files are unsupported
  in this slice. Guarded SRV support does not imply unrestricted topology discovery.
- Generic HTTP: API key, bearer token, basic auth, or headers.
- Gemini: a dedicated encrypted workspace API key, separate from Google sign-in and Drive OAuth. The server lists up to 100 text-generation models and the editor retains a manual model ID/expression fallback. Output length and request timeout are bounded; retries follow the shared failure policy. Provider calls occur only in confirmed live execution.
- OpenAI: a separate encrypted workspace API key. The server lists up to 100 models available to that key; the provider's list does not guarantee Responses API text compatibility. Manual model ID/expression fallback is available. Execution uses the Responses API with `store: false`, bounded output and timeout, and the same live confirmation boundary.
- PostgreSQL: a workspace-owned connection supports an optional provider CA
  certificate in PEM format, entered by paste or file selection. TLS certificate
  and hostname verification remain mandatory; the user is responsible for
  obtaining the CA from their database provider. The connection remains scoped
  to public DNS targets and bounded read-only operations.
- All credential values are encrypted at rest and never returned to the client after save.
- Credential lifecycle: Workspace owners can rename credentials or rotate secret payloads while preserving their immutable ID, provider, and node bindings. Existing secrets cannot be exported or viewed; rotation requires a full replacement payload. Google OAuth credentials direct owners to reconnect via OAuth.
- Safe deletion & conflict handling: Duplicate `(workspaceId, provider, label)` combinations are rejected with a stable conflict error. Deletion is blocked with a stable `CREDENTIAL_IN_USE` error whenever the credential is referenced by a workflow's current draft or published version, or by an active (queued, running, waiting) execution. Historic versions without active executions do not permanently prevent cleanup.
- Managed Google connections follow the same deletion rules. Reconnect keeps the existing credential ID. When an older connection has no verifiable Google identity, the owner reviews its usage and explicitly confirms the selected account; the application never silently switches a known account. A changed Gmail mailbox requires the trigger checkpoint to be reviewed and reactivated.
- Telegram bot credentials contain only the encrypted bot token for new connections. The node stores the destination type and chat ID; legacy credential-level chat IDs remain a backwards-compatible fallback. DM IDs are positive numeric user IDs, group/supergroup IDs are negative numeric IDs, and channels may use a negative numeric ID or a public `@username`.

The owner has chosen the existing broad Drive and Sheets scopes for workflow automation. Full Drive access is a Google restricted scope; public use requires Google verification and any applicable security assessment. Account sign-in remains separate. A connection attempt without a refresh token returns the user to the matching workspace with an explanation and retry action, without replacing an existing credential.

## 9. Approval behavior

Approval pauses the workflow and creates an expiring approval request. It may notify via Google Chat or an outgoing webhook. Google Chat incoming webhooks are notification-only, so the human approves or rejects on the app's approval page; generic callback webhooks may also resume an approval.

No multi-approver routing, reminder schedule, or approval policy engine is included in MVP.

## 10. UX and observability

- Minimal, professional visual style with dark-mode-ready tokens.
- Smooth but restrained graph and status animations.
- Realtime execution updates using WebSocket or SSE.
- The dashboard displays API runtime readiness, database/queue availability, configured worker concurrency, and active/queued work so a degraded production dependency is visible without reading logs.
- The dashboard activity overview counts retained workspace executions created
  in the preceding 24 hours, across test and live modes, with current status
  counts and an explicit refresh. The recent-run list filters only loaded pages.
- Input/output views: JSON tree, table, raw text.
- Mock run mode uses fixtures and calls no third-party API.
- **Go live** is available only after publish and always requires an explicit confirmation. The API also rejects unconfirmed live-run requests and checks that each runtime integration node references a compatible credential in the selected workspace. It executes the immutable published version, never the editable draft, and warns of real external side effects.
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
12. A user can sign in with Google or GitHub when the matching OAuth callback is configured, and cannot unlink their only available sign-in method.

## 12. Public website (owner-authorized extension, 2026-10-29)

The public service includes privacy, terms and support pages, a contact redirect,
public search/share metadata, and a branded not-found page. These pages work
without sign-in or JavaScript and reuse Fluxora branding. Privacy wording must
reflect the actual connector scopes, retention and support capabilities. See
`27-public-website.md`. This extension changes no workflow or credential semantics.

### Connection management usability (2026-10-29 refinement)
The workspace connection center prioritizes saved accounts and name/provider search. New credentials use provider-labelled draft fields (masked secret input) with an explicit advanced JSON option; flexible HTTP authentication remains JSON. Exact IDs and additional JSON properties are preserved. This adds no provider calls or secret-read endpoint. Existing encrypted storage, OAuth management and dependency-aware rotation/deletion contracts remain unchanged.

Authentication UI refinement (2026-10-29): `/login` and `/register` are dedicated
routes backed by the same form and existing authentication endpoints. Both are
noindex. Password visibility, pending/error feedback and configured social
providers remain available in both themes. Connection creation expands directly
below the connection toolbar, above saved connections, and preserves drafts when
collapsed. This changes presentation only, not credential or auth semantics.
