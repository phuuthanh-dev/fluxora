# Workspace connections, distribution and UI audit

Audit: 2026-11-10, against PR #115 (`0ae4129`) and the focused local UI changes.
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
| Google Drive/Sheets, Gmail, Calendar, Chat OAuth | User authorizes their Google account; encrypted grant saved in the selected Fluxora workspace | Google External/Production configuration and approval of the actual scopes. Previous recorded status: data access under review; approval was not rechecked in this UI batch. |
| Slack OAuth actions | Separate authorization for the selected Slack workspace | Slack app currently says **Not distributed**. Enable public installation only after configuration/readiness steps below. |
| Slack Trigger | Signed, filtered events for the registered workflow endpoint | One shared Slack app needs a common event ingress and routing across installations/workflows. Public Distribution alone does not implement this. |
| GitHub, GitLab, Notion, Trello, Sentry, Vercel, Reddit | User supplies their own provider token/key | Managed OAuth is not implemented for these connector credentials. Login with GitHub is a different feature. Each provider needs its own OAuth/review lifecycle if adding one-click connection. |
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
- The production and localhost redirect URLs currently share an app. Use a
  separate development app for HTTP localhost rather than breaking local OAuth
  while preparing an HTTPS-only production registration.
- The Events URL is associated with a qualification workflow, not a shared
  installation router. Do not replace it casually: existing subscriptions depend
  on it. The application currently rejects rotating/expiring Slack token payloads;
  token rotation must remain disabled until its lifecycle is implemented.

Recommended sequence (proposed work, not already implemented):

1. Keep production callbacks/features HTTPS; use a separate development app.
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

Notion is a sensible later managed-OAuth candidate: implement its authorization
and refresh lifecycle once, reuse the existing action adapter, and retain manual
tokens. Do not add a generic OAuth engine or new node versions for this.

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
