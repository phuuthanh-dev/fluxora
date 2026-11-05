# NX-07: architecture decisions and provider gates

Baseline: `3c9ac35`. These decisions guide implementation; they do not claim
that the capabilities below are already shipped or qualified.

## Item processing

Today a node runs once per execution and the unique execution identity is
`(executionId, nodeId)`. An output array does not fan out downstream. A future
bounded map needs stable item identities, per-item state and expression
context, explicit item/concurrency limits, branch and cancellation semantics,
and per-item ambiguous-write handling. Start with a linear mock read → map;
joins, nested loops and per-item approvals need separate designs. n8n's
[item data model](https://docs.n8n.io/build/work-with-data/understand-n8ns-data-structure.md)
is a useful reference, not evidence that Fluxora already behaves that way.
Unlike Fluxora's current engine, n8n normally processes each incoming item
automatically; its [loop documentation](https://docs.n8n.io/build/flow-logic/loop/)
also lists exceptions and a separate batching node. The editor hint
explains Fluxora's behavior when an output contains a top-level list. It does
not implement iteration, detect every nested array, or alter saved workflows.

An implementation must persist the source execution, parent item and stable
ordinal alongside each item's state, use a configured concurrency ceiling,
and preserve the original item in the expression context without exposing a
different workspace. Retry eligibility is decided per item and write attempt;
an unknown provider outcome requires review rather than an automatic replay.
Failure, cancellation and restart semantics must be specified before exposing
the feature. Per the owner decision in `docs/43-node-versioning-migration.md`, do not create
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
