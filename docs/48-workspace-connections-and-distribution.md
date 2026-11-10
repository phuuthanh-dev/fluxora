# Workspace connections, distribution and UI audit

Audit: 2026-11-10; PR #116 delivered the UI. Workspace OAuth is the following approved batch.
Implementation complete locally; final verification/release evidence is recorded below.
This document distinguishes existing behavior from proposed expansion. It does
not declare public distribution, provider verification or multi-tenant live
qualification complete.

## Each customer connects their own account

The application registration belongs to Fluxora. The provider access grant
belongs to the account/workspace that authorizes it. Sharing an OAuth client
does **not** mean sharing the developer's Google account or Slack bot token.

Current code:

- `credentials/credential.service.ts` checks workspace ownership for management
  and resolves execution credentials by ID **and workspace and provider**.
- Google and Slack connect/callback handlers bind single-use state to the
  signed-in user, workspace and optional reconnect target. They recheck access
  before saving the encrypted result. Reconnect preserves the intended identity.
- Slack saves a separate authorization with `teamId`, `teamName` and granted
  scopes. The account used by the adapter is selected through that connection,
  not a hard-coded developer bot token.
- This is the existing owner-based workspace model. It is not evidence of a
  full team membership/invitation/role product or a completed external-tenant test.

| Connector group | Account ownership today | Remaining distribution work |
| --- | --- | --- |
| Google Drive/Sheets, Gmail, Calendar, Chat OAuth | User authorizes their Google account; encrypted grant saved in the selected Fluxora workspace | Google External/Production configuration and approval of the actual scopes. Rechecked 10 November: branding/homepage complete, data access and remaining checks in progress. |
| Slack OAuth actions | Separate authorization for the selected Slack workspace | Slack app currently says **Not distributed**. Enable public installation only after configuration/readiness steps below. |
| Slack Trigger | Shared signed ingress with app/team matching and owner-scoped active subscriptions implemented locally | Deploy the shared ingress before switching the Slack Events URL; a second real installation remains unqualified. |
| GitHub, GitLab, Trello, Sentry, Vercel, Reddit | User supplies their own provider token/key | Managed OAuth is not implemented for these connector credentials. Login with GitHub is a different feature. Each provider needs its own OAuth/review lifecycle if adding one-click connection. |
| Notion | OAuth installation or manual token; each connection belongs to its Fluxora workspace | Public/Any workspace app created on 10 November; local OAuth and a bounded test-database read passed. Production release and a second tenant are separate checks. |
| Gemini, OpenAI, Steam, Riot | User supplies their own API key | Preserve the provider's supported authentication. Steam sign-in is OpenID identity, not authorization for a Web API key. Riot public use depends on Riot approval. |
| PostgreSQL, MongoDB, Supabase, HTTP, SMTP | User supplies their own database/service credentials | These remain connection forms; OAuth is not a universal replacement for database passwords or service keys. |
| Discord/Google Chat/Slack incoming webhook; Telegram bot | User supplies their webhook or bot token | A connection is already tenant-owned. Provider destination/registration limits must be considered separately from OAuth installation. |
| RSS | No account needed for supported public feeds | No OAuth distribution step. |

Catalog placeholders are not publicly usable connectors merely because an app
name is visible. This inventory does not expand supported operations or scopes.

## Slack: what public distribution means

It lets other Slack workspaces install the **same Fluxora Slack app** through
OAuth. Each installation grants its own token and permissions. It does not grant
other customers access to the owner's workspace, nor automatically list the app
in the Slack Marketplace. Slack describes unlisted distribution for early
testing and Marketplace review for broader/commercial distribution.

Read-only console findings on 2026-11-10:

- App `Fluxora` is **Not distributed**; Activate Public Distribution is disabled.
- The checklist requests confirmation that hard-coded tokens/webhook URLs have
  been removed and flags **Use HTTPS For Your Features → Update Redirect URIs**.
- The owner deferred local Slack OAuth; its HTTP callback was removed and Slack
  now marks HTTPS satisfied. A future local app can restore local OAuth.
- The Events URL is associated with a qualification workflow, not a shared
  installation router. Do not replace it casually: existing subscriptions depend
  on it. The application currently rejects rotating/expiring Slack token payloads;
  token rotation must remain disabled until its lifecycle is implemented.

Release sequence (implementation evidence below):

1. Keep production callbacks/features HTTPS. Owner deferred the separate local
   app on 10 November; local Slack OAuth is deferred, not silently supported.
2. For the managed Slack app, verify incoming signatures with its server-owned
   signing secret, then route verified `api_app_id`/`team_id` events to matching
   active workspace registrations. Apply event/channel filters, dedupe by
   registration/event and return Slack's acknowledgement promptly. Never route
   solely by an unverified payload or use a default owner's connection.
3. Exercise two distinct Slack installations and two Fluxora users/workspaces:
   OAuth state ownership, credential lookup isolation, reconnect mismatch,
   event routing, revoke/uninstall and permission-denied paths. Existing one-team
   live success does not establish these multi-tenant cases.
4. Complete the provider checklist, activate installation distribution, and
   qualify a second workspace. Seek Marketplace approval for broader/commercial
   rollout according to Slack's rules.

Notion managed OAuth is now implemented locally using the existing adapters; manual
tokens remain available. No generic OAuth engine or new node versions were added.

## UI audit and changes

The owner's screenshots show oversized, permanently expanded permission blocks,
long account labels squeezed by badges, and repeated descriptions filling every
workflow card. These are presentation problems, not reasons to modify grants.

| Surface | Finding and handling |
| --- | --- |
| Landing/public pages | Keep marketing hierarchy and motion; use its existing Gilroy family, brand lime `#c8f751` and semantic theme tokens as the product core. Do not copy hero font sizes into forms. |
| Login/register/password recovery | Existing shared auth form/header; retain their 28px form title and 15–16px inputs. No auth behavior change. |
| Dashboard | Workflow-first hierarchy: compact counts, search and cards before operational telemetry. Cards use 16px titles, 13px body, actual node-icon trails, edited date, one editor action and a secondary menu. Correct `1 node` label. |
| Connections page and editor dialog | Replace oversized cards with compact directory rows: 14px identity, provider, method, updated date and actions. Filter All/OAuth/Manual and search. Page settings open in a right-side shared Dialog; the editor dialog uses inline settings to avoid nesting. New connection stays above the list. |
| Permissions/reconnect | Keep current scopes and reconnect behavior. Visible compact attention labels remain when account/permissions need review. Full scope explanation stays beside the authorization control. |
| Editor | Existing 16px inspector title and shared fields/buttons retained. Connections dialog receives the same compact identity rows as the page. |
| Executions, Account, Admin | Shared PageHeader/SectionHeader wrap their actions instead of squeezing content. Existing semantic statuses, separate Admin shell and dialog/menu primitives retained. |
| Support/contact/privacy/terms | Keep public reading typography; source audit found no need to shrink their headings to card-label sizes. |

Card composition now has one owner in `features/credentials/credentials.css`;
conflicting card definitions were removed from `globals.css`. No new UI library,
database schema, provider scope, credential migration or live workflow was added.

Validation is performed after the edit batch. Existing credential lifecycle and
Google reconnect cases are updated to open settings first. Two focused themed
UI cases exercise mixed saved connections, long names, narrow widths, menu
access, drawer focus/close behavior and the new-connection form above the list.
Record actual final results in `19-agent-state.md`; passing UI tests is not
proof of public OAuth readiness.

## Official references

- [Slack distribution](https://docs.slack.dev/app-management/distribution/)
- [Slack Events API](https://docs.slack.dev/apis/events-api/)
- [n8n Slack credentials](https://docs.n8n.io/integrations/builtin/credentials/slack/):
  Cloud uses browser connection; self-hosted setup provides its own OAuth client.
- [n8n Google OAuth](https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/)
- [Google OAuth application states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
- [Notion authorization](https://developers.notion.com/guides/authorization/overview):
  internal connection tokens, personal tokens and OAuth are distinct options.


## Implementation in the 10 November batch

- Slack OAuth saves the provider-returned app ID as well as team ID. The shared
  `POST /api/v1/integrations/slack/events` checks Slack's raw-body signature and
  five-minute timestamp, then routes only matching app/team credentials in each
  active, current published registration. Existing database delivery deduplication
  and recovery remain authoritative; the response does not wait for node execution.
- Workflow owners register subscriptions without entering the administrator's
  signing secret. The server reads `SLACK_APP_ID`/`SLACK_SIGNING_SECRET`. Existing
  per-workflow endpoint support is not a second node version. Existing Slack
  connections need OAuth reconnect once to acquire the provider-returned app ID
  before using shared ingress. No credential is deleted or guessed from a label.
- This bounded first release covers normal workspace installations and public
  channels the bot has joined. Enterprise-wide installs and externally shared
  Slack Connect events are excluded. Revoked tokens fail provider calls; uninstall
  stops Slack delivery. Automatic revocation UI/state cleanup is not implemented.
- Registration lookup is paginated but synchronous until executions are durably
  recorded. This is appropriate to the current small installation count; a large
  public launch needs measured acknowledgement latency against Slack's three-second
  limit. It is not presented as an unlimited-scale ingress service.
- Notion OAuth uses the existing vault, credentials table and nodes. Single-use
  state is bound to the authenticated user/browser and workspace. Reconnect must
  match Notion workspace and bot identity. Manual token forms remain available.
- Notion's rotating refresh token stays encrypted. Only a definite HTTP 401 can
  refresh and retry once; 403, timeout and uncertain writes do not retry here. A
  database row lock serializes refresh across API/worker processes. This uses the
  existing table, without a migration, generic OAuth engine or new node versions.
- Managed Notion credentials expose neither raw secrets nor masked token suffixes.

### Provider evidence (not equivalent to approval)

Google Cloud verification on 10 November shows homepage and branding complete;
privacy, app functionality, data access, minimum scopes and additional requirements
are in progress. The console estimates review at four to six weeks. No resubmission
or scope change was performed. External/Production is not verification approval.

Notion's public OAuth app `Fluxora` was created after owner consent. Both production
HTTPS and localhost callbacks are registered. Marketplace listing is separate from
letting another workspace authorize the app. The owner refreshed the initially miscaptured one-time Client Secret; its new
value was saved privately in ignored local/production env. No invalid secret was
deployed. Local OAuth then succeeded with only the owner-approved
`Fluxora connector test` database and test content. The existing adapter discovered
and read that source; the manual-token connection remains available. User profile
and email capabilities are disabled. Real token expiry/refresh and a second tenant
have not been qualified; synthetic tests cover renewal and isolation.

n8n's Slack credential documentation distinguishes OAuth actions from its Slack
Trigger, which uses an API token. Fluxora's shared managed ingress follows Slack's
one-Events-URL-per-app contract, not a claim of identical n8n implementation.

Additional references:
- [Notion token exchange](https://developers.notion.com/reference/create-a-token)
- [Notion refresh](https://developers.notion.com/reference/refresh-a-token)

Owner update: configure production only; do not create Fluxora Local now. The
prepared manifest was cancelled before creation. Keep local web/API running.
