# NX-07: architecture decisions and provider gates

Original baseline: `3c9ac35`. Later updates below distinguish merged work from
design decisions and do not imply that a real provider has been qualified.

## Item processing

PR #92 implements an initial bounded item model for explicitly registered list
outputs. Items flow automatically through a single sequence of action nodes,
with current-item `$json` expressions and recorded per-item state. It supports
up to 100 items and 1 MB per node; lists of arbitrary nested fields are not
split. At that release the runner rejected branches, joins, conditions and
approvals after a list before running the graph; PR #94 changes condition
routing below. The local synthetic verification and PR gate
and main CI passed; production deployment succeeded on attempt 2 after an
owner-approved cleanup of the previous rollback image pair.

Post-deploy synthetic audit: 18 declared list-source configurations returned
the array field selected by `getItemCollectionField`, and `outputItems` produced
the same number of items. The mock Notion list-children and query-data-source
results were empty; a separate fake-transport check returned two blocks and two
pages and confirmed both were mapped into distinct items with content preserved.
These checks do not establish live provider behavior or multi-node item routing.

Regression found after PR #92: data-read-to-Chat summary templates ran the same
summary action once per item. The local follow-up adds an optional static
`executeOnce` action setting based on n8n's node setting, enables it in the five
newly created summary templates, and leaves normal per-item behavior unchanged.
Existing workflows are not modified; users can enable the setting and republish.
An empty list still stops before the action. The follow-up passed local `npm run
verify` (1,034 API tests passed, one skipped; 73 web tests and 214 browser tests
passed) using isolated test data. It shipped in [PR #93](https://github.com/phuuthanh-dev/fluxora/pull/93),
merged as `240b6ee`; PR and main CI and production deployment passed. This does
not verify delivery through a real provider. See [n8n node settings](https://docs.n8n.io/workflows/components/nodes/#node-settings).

Released in [PR #94](https://github.com/phuuthanh-dev/fluxora/pull/94) as
`6b2cd59`: If and Switch route each input
item to its matching branch with its original JSON and parent-item link. Empty
outputs do not run; joins, approvals and action error branches after item sources
remain unsupported. The runner-only `executeOnce` setting is removed before
provider adapter validation. Local `npm run verify` passed 1,045 API tests
(one skipped), 73 web tests and 214 browser tests with synthetic data. PR and
main CI and deployment passed; production health checks returned HTTP 200.
This is not a live-provider qualification.

Released in [PR #95](https://github.com/phuuthanh-dev/fluxora/pull/95) as
`3420408`: restore the source node's existing
error branch when a list-producing node fails before creating any items,
including malformed or over-limit list output. Per-item action error handling
remains unsupported and is still rejected during preflight. Local `npm run
verify` passed 1,052 API tests (one skipped), 73 web tests and 214 browser tests
using synthetic data. PR/main CI and deployment passed; public health checks
returned HTTP 200. No real-provider qualification follows from these checks.

Released in [PR #96](https://github.com/phuuthanh-dev/fluxora/pull/96): when an item action
has an Error edge, continue processing the other items and route failures to the
Error branch. Without one, stop on the first failure. Global limits and unknown
internal errors still stop. Error items retain their input fields but replace an
existing `error` field with a safe generic error object; provider exception text
is not propagated to downstream nodes. Uncertain writes are never auto-retried.
Unlike [n8n's separate On Error setting](https://docs.n8n.io/build/understand-workflows/workflow-components/work-with-nodes/#node-settings),
Fluxora uses the existing connected Error edge to select this behavior; it adds
no new setting. Connecting Error permits later items to run, including after an
uncertain outcome; the affected item itself is not automatically retried.
Local `npm run verify` passed 1,067 API tests (one skipped), 73 web tests and
214 browser tests using an isolated database and synthetic data; real provider
behavior was not tested.

n8n normally processes incoming items automatically and has broader branching
and item-linking behavior. Its [item data model](https://docs.n8n.io/build/work-with-data/understand-n8ns-data-structure/)
and [loop documentation](https://docs.n8n.io/build/flow-logic/loop/) are
references; Fluxora does not yet implement full n8n semantics.

The implementation records parent node/item and ordinal, processes sequentially,
and applies existing per-item write retry and cancellation rules. A manual
workflow retry may repeat earlier writes; an unknown outcome needs review.
Per the owner decision in `docs/43-node-versioning-migration.md`, do not create
parallel V1/V2 node implementations merely to keep old graphs working; a
future breaking item model must be explicit and old workflows may need to be
recreated. Preserve workflow publish snapshots as a separate concept.

## Binary data

Current history is JSON and Drive operations are text-oriented. A future binary
contract needs opaque workspace/execution-scoped references, validated size,
MIME and checksum, streaming limits and quotas, authorized reads, encryption,
retention across approval waits and orphan cleanup. Multi-process installations
need shared durable storage; local files alone do not satisfy that requirement.
Design and exercise cleanup before introducing attachments or media. See
[n8n external storage](https://docs.n8n.io/hosting/scaling/external-storage/).

The binary reference is an opaque capability resolved only after workspace
authorization; it is not a public file URL or a filesystem path. Before a
provider sends data, validate length and content type, stream with a hard limit,
and retain the object for the execution and any pending approval. Deletion or
expiry must not silently turn an old run into a different payload. Deployment
must test storage unavailability, partial upload cleanup, backup/restore and
quota enforcement separately from ordinary JSON output.

## Database changes

PostgreSQL LISTEN/NOTIFY is best effort: disconnections lose notifications, and
the [initial subscription race](https://www.postgresql.org/docs/current/sql-listen.html)
requires care. A durable trigger requires an independently specified source-side
outbox and catch-up, not an exactly-once claim for LISTEN. MongoDB change streams
need suitable [replica-set or sharded topology](https://www.mongodb.com/docs/manual/changestreams/),
resume tokens, leases, deduplication, backpressure and recovery when a token
expires. Do not weaken the current guarded topology/SSRF policy silently.

For either database, the source must have an explicit owner-approved change
capture configuration, bounded retention, a checkpoint tied to the provider
identity, and a recoverable outbox before an event can become a workflow run.
If the checkpoint is older than provider retention, pause and show a data-gap
state rather than silently restart at the newest event. Read-only database
credentials do not automatically authorize creation of a trigger or outbox.

## Reddit and Meta

Reddit read nodes exist but their long-term provider access is externally gated;
surface provider availability without promising continued access. Reddit announced an
[API transition schedule](https://support.reddithelp.com/hc/en-us/articles/54353370049684-Changelog-October-8-2026);
confirm current access and a permitted migration before promising a replacement.
The editor displays the published API transition notice on Reddit
nodes. It also warns when an RSS node contains a literal `reddit.com` URL:
Reddit announced that RSS support ends on 13 November 2026. This UI check
cannot detect a Reddit URL supplied by an expression or an intermediary feed;
it does not block RSS from other providers or change existing workflows.
Facebook/Instagram are disabled roadmap entries. Choose and specify a single
eligible use case first: Instagram professional account metadata is distinct
from publishing or webhook lifecycle. Meta's
[Facebook login](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
and [Instagram login](https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login)
have different account and permission requirements. App review, eligible
accounts and provider access remain external conditions, not passed tests.

## Sentry and Vercel inbound events

Vercel has distinct account and integration webhooks. Account webhooks are
documented for Pro/Enterprise accounts; integration webhooks use an integration
secret. Verify the signature against the raw request body and keep the signing
secret separate from the read-only API credential. The Vercel event ID supports
deduplication, not an exactly-once guarantee. See
[Vercel webhooks](https://vercel.com/docs/webhooks) and its
[verification and retry guidance](https://vercel.com/docs/webhooks/webhooks-api).

Sentry custom integrations have their own event subscriptions, scopes and
webhook endpoint; a personal read token by itself does not establish webhook
ownership. The provider's
[integration configuration](https://docs.sentry.io/api/integration/update-an-existing-custom-integration/)
and account permissions must be checked for the selected event and deployment.
The released source includes authenticated ingress and recovery handling for
both triggers. Provider eligibility, real delivery and sustained recovery for
the selected deployment have not been established by their presence in source.

## Trello inbound events

The existing Trello API key and user token are sufficient for the existing
REST actions but do not by themselves authenticate webhook deliveries. A
Trello Auth webhook is owned by the user token and watches a specific model;
its callback must answer a provider HEAD verification before registration.
Trello signs the exact request body concatenated with the exact registered
callback URL using the app secret, which is a distinct secret from the API key
and user token. OAuth 2.0 webhooks use the OAuth client secret instead. See
[Trello's webhook guide](https://developer.atlassian.com/cloud/trello/guides/rest-api/webhooks/).

The released source includes a board trigger with an explicitly supplied
app secret and callback, raw-body verification, a HEAD response and recovery
for accepted but unstarted deliveries. Remote webhook registration remains
manual; real provider delivery has not been qualified. The implementation does
not infer a signing secret from the API key or create a remote
webhook. Trello retries only a bounded number of times, so unavailable ingress
or a lost accepted delivery needs a visible gap/reconciliation policy rather
than an exactly-once claim. Automated registration and lifecycle reconciliation
remain future work.

Protocol recheck: Trello documents `action`, `model` and `webhook` in delivery
bodies and signs the raw body plus the exact callback URL. A regression fixture
based on the documented board-event shape was added for the all-events filter;
the fixture is not a real delivery. Vercel documents HMAC-SHA1 over the raw
body and retries for up to 24 hours. Neither observation proves compatibility
with every event payload or that a particular account is eligible. See
[Trello webhooks](https://developer.atlassian.com/cloud/trello/guides/rest-api/webhooks/)
and [Vercel webhook verification](https://vercel.com/docs/webhooks/webhooks-api).
