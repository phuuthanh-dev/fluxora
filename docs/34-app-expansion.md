# App expansion and discovery

Owner request, 2026-11-01: Trello, Sentry, Reddit, RSS, Uptime Kuma, Vercel,
and Supabase, together with a node discovery experience that scales. These are
planned integrations, not a claim that they are available or production-ready.

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
| RSS | Read a bounded RSS/Atom feed; consider trigger separately | Public feed only; bounded response, rejects DTDs, and limits XML nesting. Never put a secret in a URL. | Executable locally; targeted checks passed, browser/full verification and real-provider qualification pending |
| Trello | Create card; select board and list | Owner's API key and token; first 100 accessible open boards/lists, manual ID fallback; list membership checked before write | Implemented locally; synthetic checks only; migration, browser/full verification and real-provider qualification pending |
| Sentry | Read project issues or verified alert webhook | Owner's token or separately registered signed integration; validate event authenticity | Planned |
| Reddit | Read/search posts | OAuth and Reddit API eligibility/terms; avoid assuming unrestricted access | Planned |
| Uptime Kuma | Receive alert through existing generic webhook; assess dedicated adapter | Internal management API is unsupported; do not promise stable monitor management | Planned |
| Vercel | List projects/deployments | Owner's token, team scope and bounded pagination; webhook availability depends on account/integration | Planned |
| Supabase | Read rows using existing PostgreSQL where viable, or scoped Data API | Distinguish project data from management API; protect privileged keys and row-level access | Planned |

Discovery redesign is an independent first slice. Resource pickers, meaningful
errors, mock/live boundaries, and tests are required for each implementation;
adding a logo or disabled card is not a functioning connector. Live tests must
use owner-approved accounts and explicitly designated resources.

Trello Create Card does not provide an exactly-once guarantee: an uncertain write
is not automatically retried by the node and asks the user to inspect the list.
A manual workflow retry or worker interruption after a successful write may
still create a duplicate. Further operations and managed OAuth remain future
work; the current connection uses a user-provided key and token.

## Primary references

- [Trello authorization](https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/)
- [Sentry authentication](https://docs.sentry.io/api/auth/) and [organization issues](https://docs.sentry.io/api/events/list-an-organizations-issues/)
- [Reddit Data API terms](https://redditinc.com/policies/data-api-terms)
- [Uptime Kuma internal API warning](https://github.com/louislam/uptime-kuma/wiki/Internal-API)
- [Vercel REST API](https://vercel.com/docs/rest-api) and [webhooks](https://vercel.com/docs/webhooks)
- [Supabase database connections](https://supabase.com/docs/guides/database/connecting-to-postgres) and [API keys](https://supabase.com/docs/guides/getting-started/api-keys)

## Outbound boundary follow-up

For requests using `fetchSafeOutbound`, DNS answers are now checked at socket
connection time via an Undici dispatcher as well as during URL validation.
Requests reject local/private/reserved addresses, including mapped IPv6 forms;
the existing explicit operator allowlist remains an exception. This does not
cover unrelated direct `fetch`, SMTP, database transports, network-level
egress policy, or establish a complete SSRF security assessment. Only local,
synthetic network tests have run; no public feed was fetched.
