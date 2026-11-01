# App expansion and discovery

Owner request, 2026-11-01: Trello, Sentry, Reddit, RSS, Uptime Kuma, Vercel,
and Supabase, together with a node discovery experience that scales. Initial
operations shipped in PR #58; actual provider access and production readiness
must be qualified separately.

## Product and architecture

Keep app identity separate from executable operations, credentials and trigger
delivery. Reuse the current category filters, catalog, resource pickers, vault,
executor contract, outbound URL policy and execution/error handling. Prefer
guided selectors with a manual/expression fallback. Existing graph type IDs and
credentials must remain compatible. No secret should appear in browser output,
logs, fixtures or workflow data. Polling requires durable checkpoints and clear
first-run, deduplication, rate-limit and recovery behavior; provider webhooks
need appropriate authentication and delivery reconciliation.

## Provider direction and proof boundary

| App | First candidate | Authentication and constraints | State |
| --- | --- | --- | --- |
| RSS | Read a bounded RSS/Atom feed; consider trigger separately | Public feed only; bounded response, rejects DTDs, and limits XML nesting. Never put a secret in a URL. | Shipped with PR #58; local public feeds exposed a CDATA bug. Local fix passed focused tests and two public-feed reads; not yet released |
| Trello | Create card; select board and list | Owner's API key and token; first 100 accessible open boards/lists, manual ID fallback; list membership checked before write | Shipped in PR #58; synthetic tests and isolated migration passed; real-provider qualification pending |
| Sentry | List issues for a project | User token with organization/issue read scopes and Global/US/DE region; first page picker with manual slug fallback | Shipped in PR #58; synthetic tests and isolated migration passed; real-provider qualification pending |
| Reddit | List recent or popular posts in a public community | Owner-provided approved app ID/secret and username; app-only OAuth; Reddit eligibility and terms apply | Shipped in PR #58; synthetic tests and isolated migration passed; real-provider qualification pending |
| Uptime Kuma | Receive monitor alerts via dedicated webhook trigger | Requires `x-workflow-secret` in Uptime Kuma webhook additional headers; normalized payload, no internal management API | Shipped in PR #58; synthetic checks and full local verification passed; real-provider qualification pending |
| Vercel | List deployments for a selected project | Owner token; personal/team and project picker; first page with manual ID fallback | Shipped in PR #58; synthetic tests and isolated migration passed; real-provider qualification pending |
| Supabase | Read rows through the Data API | User's project reference and API key; secret key bypasses RLS; schema discovery can be denied | Shipped in PR #58; synthetic tests and isolated migration passed; real-provider qualification pending |

Discovery redesign is an independent first slice. Resource pickers, meaningful
errors, mock/live boundaries, and tests are required for each implementation;
adding a logo or disabled card is not a functioning connector. Live tests must
use owner-approved accounts and explicitly designated resources.

Trello Create Card does not provide an exactly-once guarantee: an uncertain write
is not automatically retried by the node and asks the user to inspect the list.
A manual workflow retry or worker interruption after a successful write may
still create a duplicate. Further operations and managed OAuth remain future
work; the current connection uses a user-provided key and token.

Sentry List Issues uses the organization issues endpoint and a project filter.
It returns a bounded subset of issue metadata; titles can contain sensitive
information and appear in execution history. Organization/project discovery
loads the first page and warns if more exist. Alert webhooks, self-hosted Sentry,
automatic pagination and a durable trigger are not implemented.

Vercel List Deployments is read-only. It uses the owner's token and selected
account/team, and exposes a bounded selection of deployment metadata. Team and
project pickers load one page and indicate when more exist. Creating deployments,
webhooks, automatic pagination and deployment triggers are not implemented.

Supabase Select Rows supports the Cloud Data API's public schema and bounded
reads. Table discovery uses its OpenAPI endpoint; Supabase restricts this for
publishable/anon keys, so the editor allows a manual table name. New API keys use
the `apikey` header; legacy JWT keys also use bearer authorization. The node does
not bypass RLS itself: a user-supplied secret/service-role key does. Custom
domains, custom schemas, filters, mutations and live-provider proof remain open.

Uptime Kuma Monitor Alert uses the existing published-version webhook lifecycle.
Configure Kuma's Webhook notification as POST + JSON and set the generated
`x-workflow-secret` in Additional Headers, then attach it to a monitor. A Kuma
test notification is acknowledged without an execution. For real monitor
events, only monitor ID/name, heartbeat status/time/ping and message are passed
on; raw monitor settings are omitted. The shared header is not an HMAC signature
and does not prevent replay; Kuma does not provide a delivery ID in this path.
Custom payloads, automatic registration, monitor administration and live
qualification are not implemented. Reference: [Uptime Kuma 2.5 webhook source](https://github.com/louislam/uptime-kuma/blob/2.5.X/server/notification-providers/webhook.js).

Reddit List Posts uses app-only OAuth, with an in-memory token and a descriptive
User-Agent. It reads bounded public post metadata, which can be retained in
execution history. User-based OAuth, private communities, publishing, triggers
and automatic content removal are not implemented. Reddit API approval, data
retention/deletion obligations and provider terms require review before release.

## Primary references

- [Trello authorization](https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/)
- [Sentry authentication](https://docs.sentry.io/api/auth/) and [organization issues](https://docs.sentry.io/api/events/list-an-organizations-issues/)
- [Reddit OAuth application flow](https://github.com/reddit-archive/reddit/wiki/OAuth2) and [Reddit listing API](https://www.reddit.com/dev/api/)
- [Reddit Data API terms](https://redditinc.com/policies/data-api-terms)
- [Uptime Kuma internal API warning](https://github.com/louislam/uptime-kuma/wiki/Internal-API)
- [Vercel REST API](https://vercel.com/docs/rest-api) and [webhooks](https://vercel.com/docs/webhooks)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres) and [API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase schema discovery access change](https://supabase.com/changelog/42949-breaking-change-removing-access-to-openapi-spec-via-the-anon-key)

## Outbound boundary follow-up

For requests using `fetchSafeOutbound`, DNS answers are now checked at socket
connection time via an Undici dispatcher as well as during URL validation.
Requests reject local/private/reserved addresses, including mapped IPv6 forms;
the existing explicit operator allowlist remains an exception. This does not
cover unrelated direct `fetch`, SMTP, database transports, network-level
egress policy, or establish a complete SSRF security assessment. DNS rebinding was tested synthetically; two public feeds were later read locally.
This does not prove production networking behavior.
