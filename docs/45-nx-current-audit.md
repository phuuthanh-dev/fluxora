# NX: current product and simplification audit

Steam qualification, 2026-11-07: a read-only local run used the owner's existing
encrypted Steam connection with the actual provider adapters. Profile, friends,
badges, vanity resolution, owned games, recently played games, achievements for
one owned game, and the account snapshot all succeeded. The check did not run
a live workflow, exercise downstream notifications, or establish availability
for other accounts, games, privacy settings, or future API responses.

Latest verified release in this audit: [PR #99](https://github.com/phuuthanh-dev/fluxora/pull/99), merge `4d394da67b445ff6e4649b583d966d4ea27aa2bb`; its PR/main gates and [production deploy](https://github.com/phuuthanh-dev/fluxora/actions/runs/42230222612) passed on 2026-11-06. Local `npm run verify` passed 1,071 API tests, 73 web tests and 215 browser tests using synthetic providers. Shared metadata describes mock behavior and key-based history filtering; it does not itself enforce redaction or qualify live integrations. Production state and provider connectivity were not revalidated in this documentation update.

Earlier release: [PR #97](https://github.com/phuuthanh-dev/fluxora/pull/97) merged as `398e397f7805ba3dfe027f2451af30c21eda993e`; its PR/main CI and [deployment](https://github.com/phuuthanh-dev/fluxora/actions/runs/42217626999) passed at the time. It refreshes execution status after an authorized SSE connection/reconnection. Redis events lost while SSE remains connected are not replayed.

Previous release: [PR #96](https://github.com/phuuthanh-dev/fluxora/pull/96) merged as `42d42865e51510f6bf72c1054ccec35ff5da2870`; PR/main CI and [deployment](https://github.com/phuuthanh-dev/fluxora/actions/runs/42202455357) passed. Production web, API and worker run this image; landing, login, API health and readiness returned HTTP 200. Local verify passed 1,067 API tests (one skipped), 73 web tests and 214 browser tests on synthetic data. No live provider was tested. With an Error edge, failed items route to Error and other items to Success; without one the run stops. Fatal limits/internal errors still stop; joins and approvals after item sources remain unsupported. Do not implement this slice again.

Previous release: [PR #95](https://github.com/phuuthanh-dev/fluxora/pull/95)
merged and deployed as `34204082407687b3cc8855c0e27d3e6a6aa1e5a7`; PR and
main CI and health checks passed. A list source's existing error branch works
when the source fails before emitting items. Per-item error branches were not
supported at that release; PR #96 subsequently added them. No real provider was
qualified for that release.

Previous release: [PR #94](https://github.com/phuuthanh-dev/fluxora/pull/94)
merged and deployed as `6b2cd5948ebde884f0abd8bd83851451edc188d2` after
PR and main CI passed. Bounded item paths now support If/Switch splits;
joins, approval and action error branches remain unsupported. The runner-only
`executeOnce` setting no longer reaches strict PostgreSQL/Supabase adapters.
Health checks passed; real providers were not exercised for this release.

Previous release: [PR #93](https://github.com/phuuthanh-dev/fluxora/pull/93)
merged and deployed as `240b6ee5ce476e0fa1dee9e718c6aea18861869a` after its
PR and main gates passed. It fixes duplicate summary notifications for newly
created data-read templates; existing saved workflows need the setting enabled
and republishing when applicable. Health checks passed, but no live provider
qualification follows from them. The NX limitations below remain applicable.

Snapshot: 2026-11-06, released commit `31a1637acd28343358352692448d32e43978833e`.
PR #92 subsequently merged into main as `a2285e488a08a4754557ac7468c2f39cd06fb9da`;
its PR and main gates passed, and production deployment succeeded on attempt 2
after an owner-approved image cleanup. Health checks passed; this is not live
provider qualification. Earlier sections describe their historical snapshots.
[PR #91](https://github.com/phuuthanh-dev/fluxora/pull/91), its
[PR gate](https://github.com/phuuthanh-dev/fluxora/actions/runs/42081700786),
[main gate](https://github.com/phuuthanh-dev/fluxora/actions/runs/42083785009)
and [production deployment](https://github.com/phuuthanh-dev/fluxora/actions/runs/42085712733)
succeeded. The deployment's internal health check passed; the public landing
returned HTTP 200. Local verification passed 1,024 API tests with one skipped,
72 web tests and 213 E2E tests using synthetic providers.

Prior release evidence:
[PR #90](https://github.com/phuuthanh-dev/fluxora/pull/90), its PR/main quality
gates and [production deployment, attempt 2](https://github.com/phuuthanh-dev/fluxora/actions/runs/42059277966)
succeeded. Public landing/login and VPS API health/readiness returned HTTP 200.
This is not live provider qualification. References below to the "local" batch,
an unreleased change, or the formerly released FIFO runner are historical: that
batch shipped in PR #90. Historical progress in `37-node-expansion-audit.md`
is not a current backlog. An unrelated later retry/timeout experiment on
`codex/nx-node-runtime-settings` is uncommitted and stopped by owner direction.

## Owner direction

- Keep one current implementation for each node operation; do not build parallel
  V1/V2 node types or a migration system just to support old graphs. Existing
  graphs using removed types may need to be rebuilt.
- Workflow publication versions and past execution records are separate product
  concepts. Node consolidation does not authorize deleting database records,
  workflows or credentials.
- Work directly without subagents. Group the work and run verification at the
  end, then use one `develop` → `main` PR for the batch.
- For NX-07, audit the remaining binary/file and database-change-trigger
  boundaries; do not implement either simply to close the old checklist. Run
  the next verification only once the audit and any authorized fixes are done.

## Inventory

| Area | Evidence in current source | Boundary |
| --- | --- | --- |
| Node catalog | `packages/workflow-contracts/src/index.ts` lists 84 executable types and five planned types, none suffixed `.v2`. | An executable type does not imply every API operation is supported or verified live. |
| Planned apps | Facebook, Instagram, Valorant, Legends of Runeterra and 2XKO are catalog entries marked unavailable. | Riot and Meta approval, account eligibility and scope remain separate provider constraints. |
| Riot LoL / TFT | Both types have executors and mock support; a private LoL trial is recorded in `38-riot-games-connector.md`. | Both executors explicitly reject live requests when `NODE_ENV=production` while Riot approval is pending. A valid-looking connection or mock success does not remove this guard. |
| Steam | Snapshot composes profile, games and optional achievements into a summary; Steam operations expose individual API reads. | The two actions overlap in data but have different outputs and uses; they are not V1/V2 duplicates. Steam privacy and provider access still apply. |
| Runtime and persistence | Nest API, PostgreSQL workflow/execution records, Redis/BullMQ worker, scheduler, approval and webhook services exist. | No exactly-once guarantee for external writes. Gmail and RSS use polling/checkpoints; several webhook registrations are manual. |
| Workflow model | Publish validation requires exactly one trigger; live executions use a published snapshot and mock runs use the draft. | The node type cleanup does not remove workflow publication versions. A removed node type in an older graph can require rebuilding. |
| AI | Gemini/OpenAI adapters support structured output and request limits. | A per-request limit is not a total monetary budget; provider/model support and real credentials require separate evidence. |
| App experience | Auth, workspaces, dashboard, editor, connections, test and live execution have source implementations. | `Run test` uses mock provider data; success cannot establish live connection health or all live input validation. |
| Connections | `CredentialService.delete` blocks deletion while draft/published workflows or active executions reference the credential. Google OAuth supports explicit reconnect and an extra review when the old account cannot be identified. | The current implementation does not automatically clear nodes or delete workflows when a credential is deleted; the blocking flow can be inconvenient and needs product UX review. Source inspection does not prove that every existing connection will reconnect successfully. |
| Google Calendar | Read, create, update, delete and availability actions have implementations. | A controlled 2030 adapter list contained the test event. A 2100 event was absent from both the adapter and the raw Google list response although free/busy reported busy; its cause is unknown. See `35-connector-coverage-and-discovery.md` for the limits of those tests. |
| Reddit | A list-posts action and access guidance exist. | Mock coverage does not establish that this application's Reddit API access works. |
| Authentication | Email/password, Google/GitHub sign-in and Steam account linking have separate code paths; session cookies are HttpOnly and marked Secure in production. | Source alone does not verify current provider approvals, environment configuration or the absence of security defects. |
| NX-07 | PR #92 implements bounded items; PR #94 adds If/Switch routing; PR #95 handles source errors and PR #96 routes individual failed items to a connected Error branch. Binary, database changes and social-provider decisions are documented in `38-nx07-design-decisions.md`. | Joins, approvals after list sources, binary storage and database change capture remain unsupported. |
| Release | PR #99 deployed as `4d394da` after PR and main quality gates passed. | This is point-in-time evidence, not proof every workflow or provider is healthy. |

Trigger review: cron only considers occurrences within the last 65 seconds, so
an outage longer than that may miss scheduled runs; recovery covers accepted
executions that have not started, not every missed schedule. Gmail and RSS poll
using checkpoints. Telegram, Trello, Sentry and Vercel webhook ingress verifies
its configured secret or signature before scheduling, but several providers
still need manual registration and their real delivery/recovery was not tested
in this audit. Local scheduler execution remains disabled by the owner's earlier
request; the web/API HTTP health checks do not prove scheduled workflows run.
The manual live execution endpoint explicitly blocks a full Gmail-triggered run,
but does not apply that same guard to the other event triggers. A user can run
their published workflow live with supplied or empty trigger data without a real
provider event. This is an explicit manual execution with the existing UI
confirmation, not evidence that webhook or polling delivery worked; downstream
actions can still affect real providers. Whether to restrict this behavior for
each trigger is a product decision and has not been changed in this audit.

A static registry comparison found 89 unique contract types and 89 matching
metadata entries; all 67 executable action types have dispatch entries, with no
extra or duplicate names. A separate source comparison found a matching
live-readiness provider rule for each of the 67 metadata entries with
credential authentication. Conditional webhook and approval requirements were
reviewed separately. These checks describe coverage of the registry, not
correctness of every adapter, permission, expression or provider response.

The 84 executable types comprise 14 triggers, two conditions, one approval and
67 actions. The catalog includes GitHub (four triggers and nine actions), Gmail
(one trigger and seven actions), Trello (one trigger and seven actions), Google
Calendar (six actions), Notion (seven actions), Chat and Telegram (four types
each), Drive and Sheets, database reads/writes, Sentry, Vercel, RSS, Steam,
Riot LoL/TFT, email, Discord and AI. Some types offer multiple operations, so
type counts are not provider API coverage counts. The five NX-03 data apps
also have example templates in `apps/api/src/workflows/system-templates.ts`;
their existence does not establish that every template was run live.

### NX checklist against current source

| Scope | Present in current release | What remains unproved or out of scope |
| --- | --- | --- |
| NX-02 — metadata and pagination | Current node types have no V1/V2 suffix; some expose multiple operations. Typed metadata, provider-organized shared configuration rules and paginated resource pickers exist; selected Drive, Notion and Gmail reads have bounded page collection. | The configuration registry has an entry for each executable type, not a guarantee of every field or output. Provider-specific safety checks remain on the backend; not every provider exposes automatic page collection. |
| NX-03 — data apps | PostgreSQL/Supabase selection, Supabase insert, Sheets mapping, Notion page/data-source operations and Trello card actions are in the registry. Five data-app sample templates are present. | Source coverage does not equal every vendor API; individual provider permissions and live results are not established by this audit. |
| NX-04 — communications and developer apps | Gmail, Chat, Telegram, GitHub, Sentry and Vercel operations are registered, with provider-specific credential requirements. | Live qualification, provider scope and behavior remain specific to each action; see the dated evidence in `35-connector-coverage-and-discovery.md`. |
| NX-05 — triggers | RSS polling and Kuma, Telegram, Trello, Sentry and Vercel webhook handlers are present alongside Gmail polling and existing triggers. | Some remote registration is manual; sustained real delivery, recovery and all provider/account eligibility are not established. Cron has the recovery limit described above. |
| NX-06 — AI | Gemini/OpenAI have structured output, schema validation, usage when returned, and per-request limits. | Live provider/model qualification is incomplete; per-request limits are not an aggregate budget. |
| NX-07 — supported items and design decisions | PR #92 implements bounded items; PR #94 adds If/Switch routing; PR #95–96 add source and per-item Error routing. Binary, database change triggers and Reddit/Meta decisions are documented in `38-nx07-design-decisions.md`. | The item subset is not full n8n parity: joins and approvals after item sources remain unsupported. Binary and DB change capture are not implemented. Meta/Instagram remain planned; Reddit access is externally gated. |

This checklist distinguishes shipped source from validation and provider
evidence. It does not mark NX complete or create work solely to preserve older
node versions.

Final audit gate, 2026-11-06: after the current-scope audit, `npm run verify`
passed against a disposable local PostgreSQL database, isolated Redis and
synthetic providers: 1,069 API tests with no skips, 73 web tests and 215
Playwright tests. Chromium logged GSAP target and WebGL extension warnings;
the suite passed, but these warnings have not been investigated in this audit.
The gate does not qualify real providers, binary storage or database triggers.

### Evidence recheck — 2026-11-06, after PR #96

- Source inventory in `packages/workflow-contracts/src/index.ts` and
  `node-config-schema.ts`: 89 registered types, 84 executable, five planned,
  an entry for every executable type and no `.v2` type. Entries do not prove
  complete field validation, live behavior or support for every vendor API.
- Runtime and publication call `nodeConfigIssues` for resolved and static
  configuration respectively; provider adapters retain additional validation.
  `operation-metadata.ts` declares authentication, known fields and selected
  pagination capabilities rather than a complete runtime output schema.
- Source includes the NX-03/04 operation families and sample templates, NX-05
  trigger handlers, and NX-06 structured output and per-request limits. The
  available synthetic tests and dated live cases in `35-connector-coverage-and-discovery.md`
  support individual paths only. Reddit access, Riot production eligibility,
  other provider approvals and untested actions cannot be inferred from a green gate.
- The previous gate log shows `system-templates.test.ts` passed draft graph
  validation, five mock data-to-Chat summaries and both AI mock summary
  templates. These fixtures do not publish every sample workflow or prove that
  live provider connections and destinations work.
- Trigger evidence rechecked against the previous isolated gate's actual log:
  the database-backed cases for RSS checkpoint/lease, cron deactivation,
  Telegram delivery identity, Kuma deduplication, Trello/Sentry delivery
  fencing, Vercel deduplication and Gmail delivery/checkpoint races ran and
  passed. Their integration flags are also enabled in the CI quality workflow.
  These cases use a disposable database and synthetic events; they do not prove
  real webhook registration, provider delivery, or every recovery scenario.
- `execution.service.ts`, `item-stream.ts`, and the item tests contain the
  bounded item, condition and Error routing delivered in PRs #92–96. The API
  integration fixture covers mixed outcomes and fatal size limits; the canvas
  E2E exercises node colours using synthetic execution state. PR #97 added an E2E for one failed mock item, its Error branch, and canvas
  colours without substituting the execution response; the final isolated gate passed it. These checks do not
  prove an end-to-end real-provider mixed-item workflow. Joins and approvals
  after list sources remain unsupported. Binary storage and database change
  capture are design boundaries, not released capabilities.
- PR #96's recorded local verify passed 1,067 API tests, 73 web tests and 214
  browser tests. The single skipped API case was the Riot database cooldown and
  serialization integration (`FLUXORA_RIOT_INTEGRATION` was not enabled in
  that run); it must not be counted as passed. The final isolated gate for the
  current local batch enabled that flag and passed the case: 1,069 API tests,
  73 web tests and 215 browser tests, no API skips. No real provider was called.
- Audit finding: when a fatal per-item limit or internal error stops execution
  even though an Error edge is connected, the API reports `execution_failed`
  with no routed target. The previous timeline text incorrectly said no Error
  edge was connected. PR #97 uses neutral stop wording, and list
  guidance now mentions supported conditions instead of claiming a single path.
  The updated UI assertion passed in the final isolated gate.
- Source audit: the editor reads execution state once and then refreshes on SSE
  messages, while the previous SSE stream did not emit a current-state signal
  on subscription. A status change while the stream was connecting or
  reconnecting could therefore be missed. PR #97 subscribes first and
  then emits a connection signal, causing the existing client to refresh after
  each authorized subscription. Its controller test passed in the final gate. This does
  not guarantee recovery if Redis delivery is lost while SSE stays connected.

### Selected n8n comparison — rechecked 2026-11-06

- [Postgres](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.postgres/)
  offers select and multiple write operations; Fluxora currently exposes select.
- [Trello](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.trello/)
  covers resources including boards, cards, checklists and labels; Fluxora's
  released operations are card-focused.
- [Gmail message operations](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gmail/message-operations/)
  include permanent deletion; Fluxora has read/get/send/reply/draft/label
  operations, not a message-delete action.
- n8n's [per-node error choice](https://docs.n8n.io/build/understand-workflows/workflow-components/work-with-nodes/#node-settings)
  includes stop and continue-via-error-output. Fluxora selects these two
  behaviors through its existing Error connection, subject to its item limits.

These are concrete differences, not proof of equal provider coverage or an
automatic request to add every operation. Real provider permissions and costs
remain separate from source and synthetic tests.

### Evidence against the original NX criteria

The original criteria are in section 6 of `37-node-expansion-audit.md`.
The owner's subsequent direction replaces parallel node versions and legacy
graph compatibility with one current node implementation; it does not
authorize removing stored workflows or credentials.

| Criterion | Evidence checked at `166ff404` | Assessment |
| --- | --- | --- |
| NX-02 metadata, pagination and account-aware OAuth | `packages/workflow-contracts/src/operation-metadata.ts`; `apps/api/src/execution/operation-metadata.test.ts`; Gmail/Drive/Notion cursor paths and credential OAuth code | Partially evidenced: registry, picker metadata and selected cursors exist, but metadata is not a complete per-node validation schema and pagination is not uniform across providers. No parallel V1/V2 work is required by current owner direction. |
| NX-03 data operations and sample workflows | `packages/workflow-contracts/src/index.ts`; `apps/api/src/workflows/system-templates.ts`; PostgreSQL/Supabase, Sheets, Notion and Trello executors | Listed operation families and sample templates exist. Source presence and synthetic checks do not prove every template, provider account, permission or resource was exercised end to end. |
| NX-04 communications and developer operations | Node registry; `apps/api/src/execution/github-update-issue.ts`, `github-write-adapter.ts`, `sentry.ts`, `vercel.ts`, `vercel-observability.ts` | Listed families, issue update, PR reads/merge and Sentry detail exist. Vercel detail is explicitly a limited public lookup whose ownership is not verified. Real behavior and permissions remain operation-specific. |
| NX-05 trigger lifecycle | RSS scheduler and `apps/api/src/webhooks/*trigger*` ingress and synthetic cases | Trigger implementations exist; manual registration, real delivery, lost-event recovery, provider eligibility and full lifecycle behavior are not established for every provider by their presence or isolated fixtures. |
| NX-06 structured AI and request limits | `ai-structured-output.ts`, `ai-request-limits.ts`, `gemini-text.ts`, `openai-text.ts` and corresponding synthetic cases | Structured schemas, validation, optional usage and per-request ceilings exist. Model support and real calls remain provider-dependent; per-request limits are not an aggregate spending budget. |
| NX-07 decisions and supported follow-through | `38-nx07-design-decisions.md`; `apps/api/src/execution/item-stream.ts`; PR #92 | Bounded linear item processing is deployed and main CI passed. Binary and DB change capture remain unimplemented; provider restrictions remain. Do not infer full n8n parity. |

PR #90 and its quality gates provide evidence for that committed release, not
for the stopped local retry/timeout experiment or any future change. Check the
owner's latest scope before proposing further implementation from this table.

Owner update: after the validator audit, the owner explicitly authorized shared
schemas and project-wide standardization, released in PR #91. Follow
`46-node-configuration-schemas.md`; registry coverage does not imply complete
validation of every provider operation or response.
Historical observation at `166ff404`: Steam snapshot treated non-boolean `includeOwnedGames` or
`includeRecentGames` values as enabled, and ignores non-string optional
`achievementAppId` values or forwards malformed text to Steam. The local
`codex/nx-validator-steam` follow-up rejected these inputs in mock/live and reused
the existing App ID validator. This follow-up shipped with PR #91; synthetic
verification is not live-provider qualification. The same follow-up also
addresses explicit invalid or unresolved Steam operation, account ID,
played-free-games choice and achievement language being treated as omitted
and replaced with a default or credential account. Empty optional fields and
genuinely absent fields retain their established defaults.
After the owner authorized shared schemas, the same local batch introduced
per-app schema files. See `46-node-configuration-schemas.md` for the current
family inventory and its limitations. MongoDB
Find rejects an explicit invalid or unresolved filter instead of falling
back to an unfiltered query. These changes and synthetic cases shipped in PR #91.

### Converging paths in the engine

Before PR #90, the runner used a FIFO queue and visited each node once. In a graph
`start → short → finish` and `start → middle → long → finish`, it can run
`finish` before `long` and leave expressions from `long` unresolved. The graph
parser permits those multiple incoming connections even though a separate Merge
node and item-level joins are outside the product scope.

The released runner now ranks the already validated acyclic graph by predecessor
depth and takes the shallowest pending node first. This ensures a reachable
longer path is processed before its downstream converging node in an ordinary
run. It still runs that node at most once, and it does not wait for a branch
that was not selected. A synthetic execution case checks the order and resolved
output and passed in the isolated gate. This ordinary graph ordering is separate
from PR #92's bounded item processing and is not a new Merge node.

Approval was a separate limitation: when a node waited, the runner marked other
unvisited nodes skipped and resumed only from approval's success targets. A
parallel sibling path pending at that moment could disappear. The released change
persists those pending node IDs in the existing execution continuation field,
then resumes them together with the approved branch; rejecting the approval
still fails the run. A disposable-database integration case covers approval,
rejection and a converging node and passed in the isolated gate. This does not establish
exactly-once provider delivery or unrestricted merge/item semantics. No live
provider call was made.

### Validator findings carried forward from the earlier inventory

| Node | Current source finding | Status |
| --- | --- | --- |
| `action.http-request` | Mock previously bypassed the live URL-prefix and header-shape checks. Live also applies outbound policy and other request handling. | Shared URL syntax/header check added locally; synthetic gate passed. Mock cannot establish reachability, outbound-policy success, credentials or provider behavior. |
| `action.google-sheets` | The surviving node rejects an unsupported operation in the dispatcher. Its mock previously skipped live range and write-values checks. | Local mock checks a supplied range and write values, and aligns write receipt shape; synthetic gate passed. Templates permit an empty spreadsheet ID for mock exploration, unlike live. |
| `action.google-chat.webhook`, `action.discord.webhook`, `action.telegram.message` | Empty message content previously passed mock; Telegram destination checks were limited to live. | Local content and configured Telegram destination checks passed the synthetic gate. Mock cannot validate credentials, permissions or delivery. |
| `condition.if`, `approval.request` | Invalid choices could fall back to a different choice at runtime. | Local correction and synthetic regression cases passed the synthetic gate. |
| `action.email` | Unsupported or unresolved `bodyFormat` previously fell back silently to text. | Local validation passed the synthetic gate; omitted field still defaults to text. |
| `trigger.cron` | Invalid cron and timezone are rejected when publishing. Scheduler scans a limited recent window. | Publish guard released in PR #89; missed-schedule behavior remains. |
| `action.steam.account-snapshot` | Snapshot had not reused the Steam ID check used by the operation node. | Local correction and synthetic regression cases passed the synthetic gate. |

Subsequent inspection found the snapshot mock always returned sample owned and
recent games and a hard-coded total of 42 even when the corresponding options
were disabled. The local mock now respects both options, derives its total from
the sample list, and provides an example achievement when an app ID is set.
The example is not proof that Steam will return achievements for that app or
account. The new synthetic case passed in the isolated gate.

The snapshot live path also treated an empty Steam `response` for owned or
recent games as an empty list and could report `0` games, unlike the separate
Steam operation. The local snapshot now reuses that operation's response
validation: a response without both count and games is reported unavailable,
an explicit zero count is accepted, and a profile must match the requested ID.
[Steamworks](https://partner.steamgames.com/doc/webapi/IPlayerService?l=english)
says owned games are returned only when visible to the caller; it does not
establish why any particular empty response occurred. Their synthetic cases
passed in the isolated gate; the new behavior has not been qualified against Steam live.

The earlier table in `44-nx-validator-audit.md` remains a historical, partial
inspection. Registry/dispatcher coverage and the findings above do not prove
that every field or live response for the other executable types is validated.

Other source paths sampled during this audit include: GitHub issue/PR reads and
issue update (repository, number, page and field checks); Notion search and
data-source query (ID, cursor and filter checks); MongoDB Find/Insert (database,
collection and bounded input checks); Trello card actions (resource and page
checks); Calendar event actions (resource and date checks); and Gemini/OpenAI
(model, prompt, per-request limits and structured schema checks). These checks
occur before mock output in the sampled paths. They do not prove complete field,
permission, network or provider-response coverage for those app families.

Additional source inspection on 2026-11-05:

| Family | Source checked | Finding and limit |
| --- | --- | --- |
| Gemini/OpenAI | `gemini-text.ts`, `openai-text.ts`, `ai-structured-output.ts`, `ai-schema.ts` | Both validate model, prompt, limits and a shared restricted schema before mock/live. Responses and usage are parsed separately per provider; this is not proof that every offered model accepts every schema. |
| MongoDB | `mongodb-find.ts` | Find and insert validate database/collection and inputs before mock/live; live connects with TLS and validates selected hosts. A mock document or insert receipt does not prove permissions, server compatibility or actual persistence. |
| PostgreSQL | `postgres-read.ts`, `postgres-select-query.ts` | Select builds a bounded parameterized read and uses a read-only transaction in live mode. Mock is a synthetic row and does not exercise the query against a server. |
| RSS | `rss-read.ts` | Action validates a URL and limit before mock/live, bounds the response, and rejects DTD/entity declarations. Scheduler and catch-up behavior are separate from this action. |
| Gmail | `gmail-operations.ts`, `gmail-write.ts` | Separate supported send/reply/create-draft/update-draft operations share MIME validation and provider handling. Sending an already-created draft is not registered or implemented. |
| Telegram | `telegram-destination.ts`, `notification-adapters.ts`, `telegram.adapter.ts`, `telegram-message-operations.ts` | Send and reply/edit share destination-type validation but differ in credential fallback and receipt handling; see the fallback limitation below. |
| Trello / GitHub | `trello-operations.ts`, `github-update-issue.ts` | Sampled card and issue actions check inputs before mock; live writes verify provider receipts and report uncertain outcomes. The GitHub issue pre-read does not prevent a concurrent update. |
| Sentry / Vercel | `sentry.ts`, `vercel.ts` | List actions validate selected resources and cursors before mock; live paths sanitize selected provider fields and expose incomplete or unknown pagination. This does not prove provider access or every response shape. |
| Riot | `riot-lol.ts` | LoL/TFT mock/live share operation and routing preparation. Live execution is intentionally blocked in production pending Riot approval. A mock result does not prove endpoint or account eligibility. |
| Trigger readiness | `live-readiness.ts`, scheduler and webhook source paths | Credential checks, endpoint reception and execution scheduling are distinct. A credential check does not prove a remote webhook exists or that an event will be delivered. |

This table records what was inspected, not a line-by-line audit of all 84
executable types or a complete provider parity certification.

Additional read-only security inspection, 2026-11-06: Google Drive/Sheets
reject the current access token echoed in provider output; Gmail and Calendar
check selected response fields and continuation tokens, and Google Chat checks
the selected space and message/thread identifiers. Existing fake-provider tests
exercise representative echo and error paths in `google-workspace-security.test.ts`,
`gmail-operations.test.ts`, `google-calendar.test.ts` and
`google-chat-oauth.test.ts`. The same inspection located representative
credential-output tests for Trello, Notion and OpenAI. These checks do not cover
every operation or every encoding of a secret, and do not establish provider
behavior. No separate test run was performed for this inspection; the final
gate is recorded above.

Further inspection found that the Sheets mock always reported one row and two
cells for a write, regardless of the supplied table. The local mock now derives
sample counts from the supplied row shapes; these are simulated counts, not a
Google receipt, and nulls or provider-side interpretation can differ. A new
synthetic case passed in the isolated gate. Drive mock also
uses sample file identifiers and names where its live upload/download paths
require configured values. These limitations do not establish live behavior.

The runtime reads `retryAttempts` and limits total attempts to 1–5, but the
inspector does not expose a general per-node retry control in the field
definitions reviewed. Timeout support is also operation-specific: HTTP,
Gemini/OpenAI and Supabase insert expose a timeout; for PostgreSQL select and
Supabase select, `timeoutMs` is accepted by the configuration whitelist but
the read paths use fixed timeouts instead. Thus an imported `timeoutMs` on
those two read nodes does not configure the request. This is a configuration
gap, not evidence that calls can run without a timeout. Resolve the intended
user-facing contract before advertising general per-node timeout support.
[n8n documents Retry On Fail under the node Settings tab](https://docs.n8n.io/build/understand-workflows/workflow-components/work-with-nodes/),
separate from retrying an entire failed execution. Fluxora already exposes
the latter in execution history; it must not be described as a per-node retry
setting. This comparison does not establish equivalent retry policies for
provider writes, which need their own failure classification.

For Telegram's original send node, the destination-type check returns early
when the chat ID is absent because an older credential may provide it; the
adapter checked that a topic ID was a positive integer, but did not check
the selected destination type against that credential fallback. A local change
now validates the fallback before dispatch and checks topic/type combinations
even when a node chat ID is missing. Reply/edit require a node chat ID. The
new regression case passed in the isolated gate; this audit sent no real message.

The Gmail operations helper had a `sendDraft` stub that always threw, with no
runtime or catalog caller; only its own test referenced it. The local cleanup
removes that stub and its associated assertion. Gmail's supported create/update
draft and send/reply operations remain separate; this does not add draft sending.
The isolated gate below passed after this cleanup.

The project has some remaining legacy OAuth identity/scope handling and webhook
delivery/release paths. They are distinct from node versioning. A prior deployment
already uses NX, yet the first-cutover and rollback scripts still contain code for
older installations. These are candidates for a separate, evidence-based cleanup;
do not delete them wholesale without checking the current operational path and
rollback assumptions. An image compatibility label named `nx-v1` is a deployment
contract, not a V1 node implementation.
For example, `Gmail` permits a read-only fallback for older credentials without
scope proof; other operations still require proof. `WebhookService` still routes
older endpoints and GitHub deliveries through `createLegacyWebhookExecution`;
the editor also displays their signing mode. These paths are currently reachable,
not merely unused files. If the owner chooses to stop supporting them, first
identify the affected connections and endpoints and define their new setup;
changing code alone would not remove remote webhooks or repair credentials.
The `kuma-v2:` and `trello-v1:` strings are delivery/recovery identifiers, not
alternative user-facing node versions.
Trello Find Cards still has a first-page path with a historical compatibility
comment; the current editor also explicitly offers “First page only” and uses
that path. It is therefore not dead code merely because the comment mentions
old graphs. Any simplification must retain a working first-page option. The
metadata's possible expression suggestions include paging fields that only
appear in page mode, and `paginationWarning` is conditional; inspect the actual
node output before relying on one of those suggestions.

The local Git inventory registered 81 worktrees: five reported clean, 62 had
modified or untracked entries, and 14 paths were missing at the time of the
scan. Several test worktrees include generated Next.js files; others include
substantial source or untracked files. The original `workflow-automation`
worktree has uncommitted Graphify configuration, and `fluxora-google-per-file`
has separate OAuth changes. These are not evidence that all their work is
missing from `main`, nor that they are safe to remove. No worktree, branch or
file was deleted; compare and classify changes before cleanup. Current local
`develop` and remote `develop`/`main` pointed at PR #89's merge commit during
the scan.
Across the 67 existing worktrees, a read-only content comparison counted 221
changed file entries matching `origin/main`, 944 differing from or absent in
`origin/main`, and 27 directory/deletion/symlink/rename entries requiring
manual review. Entries may repeat across worktrees, and differences can be old
snapshots or generated files; these are not 944 proven unmerged features.
Those differing file entries cover 352 distinct paths, including 199 paths
reported as untracked. For example, `apps/web/next-env.d.ts` appears in 32
worktrees. The comparison does not inspect the contents of untracked directories
or establish which historical changes are still useful.
Four local branches were not ancestors of `origin/main`. `git cherry` reports
equivalent patches for the sole commits on `codex/nx-expansion`,
`codex/rss-cdata-fix` and `fix/manual-staging-deploy`; the older
`codex/github-connector-p2-1a` contains 19 commits without a matching patch ID
and needs separate content review before cleanup. A patch-ID mismatch alone
does not establish that its features are absent, especially after later edits
or squash merges. A source-level check found that its GitHub connector, issue
idempotency, four action types and four trigger types exist on current main;
this is not a line-by-line equivalence assessment of all 19 commits.

The separate uncommitted `fluxora-google-per-file` changes describe broad Drive
and Sheets consent and its UI explanation. Current main already has those
scopes in `google-oauth-policy.ts`, the broad-access explanation in
`credential-panel.tsx`, and the decision in the product specification. That
worktree also has two untracked tests written against its older controller/UI;
they have not been copied or deleted. The current UI test covers the broad-access
explanation; this batch adds an independent OAuth authorization-URL assertion for
the agreed broad Drive and Sheets scopes; the isolated gate passed. This is a
feature-level comparison, not approval to remove the worktree.

The earlier pending-inspector-edit report described its work as local-only.
Git ancestry shows implementation commit `b5a831f` was included in PR #55 and
is in current `main`; the current editor still has pending-edit blocking. Its
old interrupted local verify remains an interrupted run, not a passing one.
Historical handoff documents are labelled accordingly to avoid proposing that
implementation again.

For comparison, [n8n's workflow model](https://docs.n8n.io/build/work-with-data/understand-n8ns-data-structure.md)
passes items between nodes, while Fluxora currently runs a node once and does
not automatically fan out an output array. [n8n allows credentials to be selected
in a node and provider resources to be chosen from populated lists](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gmail/message-operations/).
Fluxora has resource pickers for many operations, but not every operation is
equivalent. These are product comparisons, not a requirement to copy n8n's
whole architecture or every provider API.

On testing, [n8n's documentation](https://docs.n8n.io/build/understand-workflows/understand-executions/types-of-executions/)
describes manual execution of the workflow and partial execution of a selected
step plus the preceding nodes needed for its input. It also offers
[mock and pinned data](https://docs.n8n.io/build/work-with-data/pin-and-mock-data/)
during development; pinned data is not used in production runs. Fluxora's
current Run test uses mock provider data, while its Run node debug runs only
the chosen node. Do not present either as n8n-equivalent live partial execution
or as proof of a real connection. User-configurable pinned data and execution
of upstream nodes would be separate product work, not part of this correction.

## Historical batch — shipped in PR #90

- The If operator and approval notification provider reject unsupported runtime
  values rather than silently selecting another behavior. The approval provider
  must be a static supported selection on publish so preflight checks the correct
  credential. Omitted values retain their ordinary defaults.
- The editor explains after both full mock runs and node debug that mock output
  does not verify live connections or all inputs. Duplicate test fixtures were
  removed, with registry uniqueness checked.
- HTTP mock and live now share URL syntax and header-shape checks;
  this does not establish that a URL is reachable or passes outbound policy.
  The three webhook notification nodes now check content in mock and live;
  Telegram also checks a provided destination in either mode. Mock can still
  omit a destination because live supports a connection fallback. Sheets mock
  checks a supplied range and write values but allows a sample spreadsheet ID.
  The editor notice remains necessary: mock validation is not a live provider
  request. These local changes passed the synthetic gate.
- Sheets append/update mock receipts now follow the corresponding provider
  response shape. Mock-only top-level append counts and `range` were removed;
  append workflows should use `updates.updatedRows` and `updates.updatedCells`.
  A mock-only compatibility hint and its dedicated E2E were removed. Live API
  response mapping and already stored executions are unchanged.
- Steam Snapshot reuses the existing Steam ID validator for a configured ID
  in mock/live and for the credential fallback in live mode. Invalid values
  fail before a Steam request; an omitted mock ID still uses sample data. IDs
  must be strings: a previously accepted numeric value must be entered as text.
  This change passed the synthetic gate and shipped in PR #90.
- Steam Snapshot mock now uses `profile.steamid`, matching the profile field
  returned by Steam in live mode. A mock-only expression using the old
  `profile.steamId` needs to be changed; stored execution results are unchanged.
- Readiness tests now use a single registry-wide consistency check in place of
  overlapping provider-specific checks; remaining mixed-graph and service tests
  retain coverage for conditional requirements and error behavior. Misleading
  node-version test labels and an orphaned upgrade comment were removed. The
  revised test suite passed in the isolated gate.
- Two PostgreSQL and Supabase test wrappers left over from node consolidation
  were removed; the same tests now call the current implementation directly.
- The Sheets inspector no longer passes a boolean that was always true to its
  field builder. Its input-option field remains present in the same position;
  this source cleanup passed the isolated gate.
- A syntax-based scan of `test(...)` callbacks found no exact duplicate callback
  bodies after the fixture cleanup. It does not cover semantic overlap, every
  test framework form or different tests that happen to exercise the same code.
- Current-state and specification documents were corrected to distinguish
  deployed work, historical notes and work that remains unverified.

These changes shipped in PR #90 and production commit `166ff404`.
On 2026-11-05 an attempted full verify stopped at the deployment test stage:
57 tests passed and two test guards rejected the disposable database name
because it did not contain `test`. A later isolated `npm run verify` with a
correctly named disposable database passed: 991 API tests, 72 web tests and
213 Playwright tests. It used synthetic provider data; it did not qualify live
providers. After the audit and subsequent corrections, a final isolated
`npm run verify` passed with 996 API tests, 72 web tests and 213 Playwright
tests. All API integration flags, including approval and Riot database cases,
were enabled against a disposable local database; no live provider was used.
Playwright logged existing GSAP missing-target and WebGL extension warnings;
the associated tests passed.

## Remaining boundaries

- The NX table above distinguishes existing operations from incomplete provider
  and pagination coverage; a registry entry is not proof of live behavior.
- Bounded item processing, If/Switch and connected Error routing shipped in
  PRs #92–96. Joins and approval after item sources, binary storage and database
  change capture remain unimplemented. Do not start deferred systems or a new
  scope solely because they are listed here.
- Qualify individual real providers only when their credentials, permissions,
  intended destination and potential side effects have been explicitly allowed.
