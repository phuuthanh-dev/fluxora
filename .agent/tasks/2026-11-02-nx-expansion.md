# NX expansion implementation

## Identity
- Task ID: 2026-11-02-nx-expansion
- Base: 3c9ac35560126d6f7240f428efe0734275896218
- Branch: codex/nx-expansion; coordinator and isolated agent worktrees.

## Target slice IDs
- `APP-EXPANSION-1`

## Outcome and scope
Deliver remaining NX-02 through NX-07 in docs/37 in dependency order. First
establish compatible node metadata and field help, then extend existing apps,
durable triggers, and structured AI output. NX-07 requires evidence-backed
architecture decisions for item/batch, binary, DB listeners and providers.
Existing node implementations and qualification receipts must not be repeated.

## Acceptance criteria
- [ ] Coordinator personally audits every integrated agent-authored change and
  candidate before keeping it, checks for duplicated/dead code and unsupported
  claims, and performs subsequent implementation directly as requested.
- [ ] Shared contracts and inspector metadata support extension without breaking saved graphs.
- [ ] Useful provider operations and discovery are implemented with safe writes, bounded output and tests.
- [ ] Durable triggers handle checkpoints, restart, deduplication and lifecycle.
- [ ] Gemini/OpenAI structured output validates schemas and bounds provider responses.
- [ ] NX-07 decisions record provider gates, lifecycle and security constraints.
- [ ] All work is integrated and reviewed before a single final npm run verify.
- [ ] Release via one develop-to-main PR, merge on CI pass and monitor deployment.

## Boundaries
Preserve the pre-existing next-env.d.ts change, local data and existing auth.
No real provider calls or credentials; no secret logging; no new scopes without
clear user authorization. Workers own disjoint worktrees/files, never release,
install or run tests; coordinator reviews and validates at end. Respect old
published workflow versions and SSRF, credential, retry and redaction rules.

## In-progress handoff

- Coordinator changed Calendar field help from a global `pageToken` special
  case to declarative field metadata and added a Notion search cursor with
  opaque, bounded validation. Tests are written but have not run.
- NX-07 research is summarized in `docs/38-nx07-design-decisions.md`; actual
  implementation and external provider access remain open.
- Unverified drafts integrated: node v1 and output metadata, Trello and
  Notion operations and discovery, GitHub issue/PR reads and pickers, AI
  structured output and builder, PostgreSQL safe select and column discovery,
  Supabase query/column-discovery backend. Preserve draft edits across turns.
- PostgreSQL/Supabase visual selection UI and synthetic E2E draft from
  `/private/tmp/fluxora-nx03-relational-ui-20261102` have been integrated
  unverified; an independent review is in progress. Gmail operations candidate at
  `/private/tmp/fluxora-nx04-gmail-20261102` needs independent review and
  explicit consent/scope integration before exposing write nodes.
- RSS trigger and lifecycle candidates at `/private/tmp/fluxora-nx05-rss-20261102`
  and `/private/tmp/fluxora-nx05-lifecycle-20261102` are not integrated:
  coordinate storage, scheduler, race fencing, recovery and status UI before
  enabling. A consolidated still-disabled draft and the remaining-work record
  are in `/private/tmp/fluxora-nx05-integration-20261102`; public URL and
  manual-live boundaries are under development there. Google account-aware OAuth is under development at
  `/private/tmp/fluxora-nx02-google-accounts-20261102`.
- Independent reviews identified scope, replay, mailbox data, token redaction
  and partial-content issues in Gmail and CAS/session/legacy-migration issues
  in OAuth. Candidate owners are fixing them before any integration; reviewed
  findings are not evidence that these features are ready to release.
- Sheets discovery and mapping candidate is in
  `/private/tmp/fluxora-nx03-sheets-20261102`; shared metadata candidate in
  `/private/tmp/fluxora-nx02-metadata-20261102`. The descriptive metadata
  candidate has been copied to the coordinator; it is not an authorization
  or retry registry. Telegram and Sentry/Vercel candidates are in
  `/private/tmp/fluxora-nx04-telegram-20261102` and
  `/private/tmp/fluxora-nx04-observability-20261102`, under independent review.
- Second OAuth review covers the revised Redis-backed one-use state and PKCE;
  the existing Google login email-linking issue was identified separately and
  must not be mistaken for a new OAuth connector regression.
- OAuth account candidate and Sentry/Vercel bounded read nodes are now copied
  into the coordinator unverified. Sentry/Vercel output is intentionally
  partial; Vercel public lookup does not assert ownership. Relational review
  found unresolved expressions, unknown filter keys and save-in-flight races;
  fixes are in progress in the relational/UI worktrees. Durable write attempt
  and replay foundations are under development in
  `/private/tmp/fluxora-nx-durable-write-20261102`.
- Sheets tab/header UI and discovery were integrated unverified. Selection
  backend fixes reject unresolved filters and report pagination as unknown;
  editor now compares the saved graph with current state before chained runs.
  Avoid overwriting the coordinator's Sentry/Vercel editor/catalog edits
  when importing further worker patches. Redis-backed OAuth policy and
  scope-token binding are integrated locally but unverified.
- Gmail get-message and cursor pagination were added to existing read
  operations locally; adapter write methods remain unregistered until durable
  side-effect recovery and explicit per-capability consent are integrated.
- AI structured output, provider-side schema requests, local output validation,
  an optional per-request operator output-token ceiling and editor cost notice
  are integrated locally without verification. This ceiling is not an overall
  spending cap; no live AI request was made in this batch.
- RSS scheduler and lifecycle are draft-only and explicitly disabled in the
  isolated worktree; activation, receipt-authenticated execution, credential
  race and lease recovery remain. Kuma filters, Chat, Telegram and durable
  write protection candidates require review/integration; no live activation.
- Google account scope-proof and explicit Gmail consent changes are now
  integrated locally and unverified, including synthetic fixes for refresh
  serialization and legacy compatibility. The Gmail operation adapter is not
  yet connected. OAuth rollout must drain old refresh-capable processes.
- Sentry/Vercel list pagination was folded back into existing list nodes,
  preserving their legacy output and avoiding duplicate catalog entries;
  separate detail nodes remain. These changes remain unverified.
- Trello and Telegram webhook-trigger worktrees remain disabled candidates.
  Their migrations, provider registration and durable outbox/queue integration
  must be reconciled with RSS, Kuma and write-recovery drafts before release.
- Sentry/Vercel webhook foundation worktree:
  `/private/tmp/fluxora-nx05-observability-20261102`; provider plans and
  signing credentials differ from read credentials. No live provider calls.
- The durable-write worktree now has a restore hold/epoch protocol but cannot
  automatically detect restoring an old snapshot under the same epoch. Its
  independent review found old approval-generation handling, restore script
  sequencing and interrupted-migration blockers; fixes are underway there.
  RSS, Kuma, Trello and Telegram must share the same vetted queue generation
  and credential lock protocol rather than merge their independent copies.
- Despite the coordinator's explicit instruction to defer all checks, the
  Trello webhook worker reported running five targeted tests and a targeted
  strict typecheck in its isolated worktree. This is not final verification.
  The worker was reminded not to run any further checks before integration.
- A Telegram trigger worker also generated its isolated code graph and ran
  `git diff --check` before the final gate. It was instructed to defer all
  further checks and graph generation; these are not a release receipt.
- Independent reviews found runner lease/claim and approval continuation races
  in the durable-write/Kuma drafts. They remain isolated and must not be
  enabled or released without the fixes and a coordinated worker rollout.
- The queue/Kuma draft persists continuation generations but remains gated
  pending review of old jobs and recovery. The OAuth candidate's last
  checkout-timeout fix has been integrated but awaits final verification.
- The isolated combined queue draft has attempt-token/epoch fencing, bounded
  generic and RSS claims, approval provenance, gated RSS dispatch/consumer and
  unverified DB-revision and receipt guards. Trigger/index migration effects,
  global retention/backpressure, legacy approval adoption, mixed-fleet cutover
  and provider effect recovery remain incomplete. Do not copy or enable it as
  a finished runtime. Independent review found this design disproportionate for
  NX-05 and noted that its migrations can affect existing providers even when
  disabled. Two fresh isolated tasks now target a minimal RSS implementation
  reusing Gmail checkpoint/receipt/queued recovery and separate worker lease
  hardening. The worker proposal was reviewed and not integrated: its default
  gate blocks existing dispatch and can strand queued records. Neither task
  may claim exactly-once or lossless RSS snapshots. Per user direction, the
  coordinator must personally audit all agent code and do subsequent work.
- PostgreSQL/Supabase v1 and versionless nodes preserve their historic read
  behavior; new selections use a distinct `.v2` type and historical drafts require explicit
  upgrade. This integration is unverified. User JWTs are optional and do not
  refresh automatically; metadata availability does not imply row access.
- The old worker ignores nodeVersion, so v2 can run without its filters if an
  old worker consumes it. The current production deploy does not prove a
  fleet-wide drain; `/private/tmp/fluxora-rollout-oauth-node-v2.patch` is a
  fail-closed draft requiring an unimplemented independent operations hook.
  A distinct v2 node type has been integrated locally so old parsers with the
  old registry reject those graphs before execution; an old worker may still
  fail the run. This has not been verified. It does not solve OAuth overlap or the
  fleet rollout. Do not merge into auto-deploy until those are resolved.
- A read-only count on the local `WorkflowVersion` table found no persisted
  legacy relational type with explicit nodeVersion 2 at the time of the
  query. This is a point-in-time observation; recheck before removing support
  for that transient draft representation. No local data was modified.
- Drive list/search cursor and trusted top-level Gmail/Calendar/Drive output
  continuation tokens were integrated locally, unverified. They do not expose
  nested token fields or credential values in the cursor.
- Independent source review confirmed that Drive/Gmail/Notion/Sentry/Vercel
  legacy nodes previously ignored new pagination inputs and added output keys
  can alter expressions. Distinct `.v2` types and explicit draft upgrade are
  now integrated locally, unverified. Recheck for interim local drafts and
  evaluate old workers and OAuth rollout before release.
- Independent review found Google Drive/Sheets write redirects could replay
  POST bodies; the coordinator added manual redirect handling and synthetic
  307/308 cases, unrun. Legacy Sentry/Vercel read redirect behavior is restored.
- The coordinator directly added a distinct Kuma filter node for monitor ID
  and status, with legacy behavior, authenticated matching, fail-closed filter
  validation and source tests. Its optional idempotency-key payload conflict
  detection and recovery are still outstanding. This code is unverified.
- User explicitly requested that after the current round the coordinator audit
  agent-authored code and implement subsequent work personally. No additional
  subagents; the in-progress minimal RSS worker was asked to stop and hand off.
- Coordinator source-audited the minimal RSS candidate and documented five
  actionable findings in `.agent/reports/2026-11-03-rss-candidate-audit.md`.
  It remains isolated, unverified, disabled and not integrated.
- Coordinator rechecked the agent-authored Trello pagination, AI schema and
  Google OAuth changes against their prior implementation. Trello's
  same-second pagination limit is disclosed in both the output and editor;
  AI's token ceiling is per request rather than a spending cap. The OAuth
  test rewrite removed malformed-expiry regression cases, so those cases have
  been restored as source tests, without running them before the final gate.
  These focused reviews are not a full audit of all integrated agent code.
- Coordinator review found provider-controlled Trello card names and Notion
  titles/cursors could echo stored credentials into discovery results. Source
  now masks titles before truncating, rejects credential-bearing continuation
  IDs and includes synthetic regression cases; none has run yet. Kuma v2
  dispatch recovery and idempotency conflict detection remain open: the
  existing queue does not fence an initial dispatch against approval resume,
  so a scanner cannot safely be added merely by copying Gmail recovery.
- Coordinator added an opt-in `initialOnly` job/atomic claim and a separate
  BullMQ job ID. A stale initial job cannot claim a previously started
  execution, and a pre-claim worker error only fails a still-unstarted run;
  after claim, lease maintenance handles errors because this job has no phase
  ownership token. Source tests cover these guards but have not run. This does
  not fix general worker fencing or approval-resume recovery.
- Kuma v2 now uses a nullable additive execution digest migration, a
  workflow/endpoint-locked acceptance transaction, keyed payload conflict
  detection, and a bounded scanner for accepted never-started runs. Only v2
  uses initial-only queue jobs; legacy webhook behavior is unchanged. No key
  means no dedup; the window ends on execution retention or encryption-key
  rotation. Source unit and disposable-DB integration cases are written but
  unrun. The migration is applied to local `workflow` on localhost only, not
  production; the new v2 ingress is not qualified until final verification.
  Mixed-worker cutover and generalized approval continuation remain open.
- Coordinator personally implemented an RSS-only public transport, without
  relying on the general outbound hostname allowlist. Draft URL parsing is
  syntax-only; runtime checks public addresses at DNS and socket boundaries,
  accepts ordinary query parameters/encoded paths and follows at most five
  same-origin redirects. Recognizable secret query parameters are rejected;
  signed/private feeds still need a credential design. Source tests are
  written but unrun. This transport is not yet wired into a trigger; RSS
  checkpoint lifecycle, receipt retention, atomic delivery and UI remain open.
- Coordinator added a bounded RSS snapshot parser using raw GUID/Atom ID,
  then raw link, then content for stable item identity. Duplicate/missing
  identities and feeds over 100 items fail without advancing a checkpoint.
  Normal link query parameters are preserved while recognizable secret
  parameters are stripped from links and embedded URLs. These source tests
  have not run; the parser is not yet connected to polling or persistence.
- Coordinator added a draft RSS poller and transactional store plus an
  additive checkpoint/receipt migration. Baseline suppresses old items; 304
  keeps the snapshot, a total overlap gap fails closed, and 429/503 delay is
  retained. The store locks workflow, checkpoint and required credentials;
  it commits new executions and snapshots together, caps each trigger at
  10,000 receipts and expires unseen terminal receipts after 30 days. An item
  can be delivered again after its receipt is expired. A disposable-DB
  integration test source was added. The scheduler now
  queues accepted executions with the initial-only fence and recovers queued
  runs, while activation/publish/reset lifecycle is implemented in source.
  Changed/removed feeds require a separate confirmation; resetting cancels
  only never-started queued runs. Status/reset endpoints are owner-scoped.
  The local additive migration is applied and client/contracts regenerated to
  keep the preview usable; source tests are still unrun. Inspector UX, reset
  confirmation and publish confirmation are wired locally. Local scheduler
  remains disabled, so no live RSS poll happens merely from this preview.
- Lifecycle and polling scheduler tests now include synthetic unit cases,
  disposable-DB integration sources for checkpoint retention across publish,
  and a mocked browser status/reset flow. None has run. RSS trigger has been
  registered in the executable catalog for local preview; runtime behavior and
  mixed-worker rollout must be validated before any release claim.
- Coordinator personally added Telegram reply/edit as separate operations in
  the existing provider group, reusing the destination controls. Requests use
  the selected workspace credential, block redirect replay and decline retry
  after uncertain writes; a confirmed receipt is checked before success. No
  live provider call was made. Synthetic adapter and mocked UI tests are source
  only and unrun; generalized worker fencing remains unresolved.
- Coordinator audited the isolated Telegram trigger candidate in
  `.agent/reports/2026-11-03-telegram-candidate-audit.md`; its forced second
  bot, non-atomic remote hook mutation, unsafe default transport and retained
  outbox require redesign. A separate normalization/filter/authentication
  protocol and synthetic tests were written locally. Subsequent coordinator
  work wires a distinct manual Telegram webhook trigger into the existing
  endpoint, authenticated by Telegram's secret header and deduplicated by
  update ID; no remote webhook registration or live provider request was made.
  Durable identity depends on execution retention and encryption-key lifetime.
  Synthetic ingress and disposable-DB tests (`FLUXORA_TELEGRAM_INTEGRATION=1`)
  were added but remain unrun. Mixed old/new worker behavior remains a gate.
- Coordinator personally added distinct Google Chat thread-aware send and reply
  nodes. Reply explicitly rejects creating a new thread if the target is absent;
  legacy output remains separate. Synthetic receipt/compatibility tests are
  written but unrun, and no Google provider or OAuth settings were changed.
  Chat edit and broader scope handling remain open. Local web/API health returned
  200 after rebuilding contracts, solely to keep preview available.
- Coordinator checked RSS activation, reset and store: both baseline paths seed
  durable receipts, so the initial claim that baseline items would always be
  delivered was incorrect. Poller now also excludes items in its immediately
  preceding snapshot as defense in depth; older returning entries still rely on
  retained receipts. Synthetic tests were added but are unrun. A timeout between
  RSS redirects previously became a permanent URL-policy error; it now retains
  its timeout reason and a retryable classification, also unverified.
- Coordinator reviewed Gmail resource discovery and added access-token redaction
  before truncating provider-controlled label names, and rejects IDs containing
  the token. A synthetic boundary regression test was added but has not run.
  At that review point Gmail write adapters were unregistered; the subsequent
  draft integration is noted below. No provider requests were made.
- Subsequent coordinator work registered Gmail send/reply/create-draft and
  add/remove message label as local draft nodes with explicitly selected OAuth
  scopes, non-retryable ambiguous writes, a label picker, and simulated mock
  responses. Tests are source-only and unrun; this registration is not a
  production-readiness claim. Queue/worker fencing and rollout remain gates.
- Gmail draft replacement and an owner-scoped, paginated draft picker were
  added to the local draft; the inspector warns that replacement removes any
  existing attachment. Discovery requests at most ten draft metadata records
  per page and falls back to IDs when details fail. Synthetic tests were added
  but not run; no provider request was made. Provider references:
  https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/list
  and https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/update
- Direct approval audit found concurrent decisions used unconditional updates,
  and approval without a successor left an execution permanently QUEUED.
  Source now performs guarded transactional transitions, using the execution
  as serialization point, and completes a terminal approved run. Cancellation
  claims a nonterminal state transactionally in the same order. A disposable-DB
  concurrency test was added (enable `FLUXORA_APPROVAL_INTEGRATION=1` for the
  final gate) but has not run. This does not solve in-flight worker fencing,
  stale continuation provenance, or loss between committing an approval and
  dispatching its continuation; those remain required before release.
- Coordinator added a draft persistent approval continuation nonce, node IDs and
  queue timestamp in additive local migration `20261103140000_approval_continuation`.
  Queue IDs are phase-specific; new workers atomically claim only the matching
  nonce, and a recovery scan retries a lost dispatch. Legacy Gmail recovery
  skips nonce-bearing continuations. Synthetic tests were added but remain
  unrun; the migration was applied only to local `workflow@localhost` and
  Prisma regenerated to keep the preview working. This does not establish
  safety during a mixed old/new worker rollout, automatic replay after a worker
  starts an external action, or general in-flight cancellation fencing.
- Approval resolve now distinguishes a saved decision from an unconfirmed
  queue submission. A queue error after the commit is reported as unconfirmed,
  not as a failed decision, and the editor keeps that message even if a
  subsequent execution refresh fails. The controller test is source-only and
  unrun; with the scheduler disabled, automatic recovery is also disabled.
- Coordinator reviewed Notion read adapters and added cancellation of unused
  provider error bodies before retry/return. A synthetic stream-cancellation
  test was added but remains unrun. No provider interaction was performed.
- Coordinator added a draft Google Chat edit action and opt-in management
  consent. Selection is signed into OAuth state and bound to the stored refresh
  token; existing connections do not implicitly gain management permission.
  Scope projection handles a provider returning the broader grant in place of
  create-only. Synthetic state/scope/adapter tests are unrun; this requires
  careful refresh-rotation review, final verification and Google app review
  before release. Google Cloud settings were not changed.
- Direct coordinator audit found that cancellation or lease expiry could win
  while a node was running and then be overwritten by its success/failure
  update. Terminal transitions now conditionally update only a RUNNING
  execution and emit a completion event only if that update wins. A synthetic
  cancellation-race test and scope-revocation summary test were written but
  not run. This does not fence external effects, waiting-approval creation,
  node-level writes, or stale workers holding the same RUNNING state; those
  remain release gates. Google Chat management is no longer reported enabled
  when the current scope grant is missing or its proof is invalid.
- The runner also checks that renewing its RUNNING lease succeeded before
  starting each next node; a synthetic lease-loss case was added but not run.
  This cannot recall an external request already in flight or establish a
  unique worker generation.
- Approval request creation, its node output, skipping remaining nodes and the
  transition to WAITING_APPROVAL now share a guarded execution-first database
  transaction. If cancellation wins, no approval is created. A synthetic
  source test covers both outcomes but is unrun. Notification is best-effort
  after commit: a concurrent cancellation cannot recall an in-flight request;
  a crash can leave its display status pending. Existing node-level writes and
  worker-generation fencing are not solved by the transaction.
- Direct audit of the Trello operation candidate found that provider-controlled
  card names/descriptions could echo the vault API key or token into execution
  output. Draft changes remove exact credential echoes from text and reject
  unsafe IDs, URLs and cursors; on a confirmed write with an unsafe receipt the
  outcome is uncertain and is not automatically retried. Synthetic read,
  collection and write cases were added but remain unrun. This is not a claim
  that other adapters or transformed secrets are covered.
- Direct review of Google Chat send/reply found that HTTP 408, redirects and
  5xx were displayed as ordinary provider errors even though the write may
  have succeeded. These are now classified as DELIVERY_UNCERTAIN without
  automatic retry; known 429 handling remains as before. The existing source
  tests were updated and expanded for redirects but have not run.
- Direct runner audit found a retry loop could start another provider attempt
  after cancellation or lease expiry. After its retry delay the draft runner
  now requires a successful lease renewal before another attempt; a synthetic
  cancellation regression case is written but unrun. A cancellation can still
  race with an already-started request and node-level writes remain unfenced.
- Coordinator checked Trello's current official webhook protocol and recorded
  the separate app signing secret, exact callback/HEAD handshake, token/model
  ownership and bounded retry requirements in `docs/38-nx07-design-decisions.md`.
  Existing API key/token alone is not sufficient evidence for a secure Trello
  inbound trigger. No provider account or webhook was changed.
- The runner's node start/input/result/failure writes now serialize on the
  execution row and proceed only while it remains RUNNING, matching the lock
  order of cancellation and approval. A disposable-database concurrency case
  was added to the approval integration test but has not run. Transactions are
  released before provider I/O: cancellation cannot undo an in-flight request,
  and status alone is not a unique worker-generation fence. Mixed-version
  rollout remains a separate unresolved gate.
- AI model discovery now drops identifiers that echo the connection key and
  removes echoed keys from Gemini display names before returning them to the
  picker; source regression cases are unrun. This concerns discovery metadata,
  not a claim that arbitrary generated content cannot contain sensitive data.
- Cancellation feedback in the editor now states that provider requests
  already sent may still complete, so the user knows to check before retrying.
- Coordinator personally reviewed the isolated Sentry/Vercel webhook
  candidate and documented findings in
  `.agent/reports/2026-11-03-observability-candidate-audit.md`. Vercel's
  documented nullable team conflicts with the candidate's mandatory team
  identity; worker generation, credential locks, retention and remote state
  are also incomplete. The candidate remains isolated and is not a delivered
  trigger. No tests or provider calls were run as part of this review.
- Telegram's manual webhook dialog now suggests a workflow-specific path and
  checks the same path syntax as the API before enabling registration. A
  mocked browser journey covers the allowlist, manual ownership warning,
  invalid path and one-time secret; it is written but unrun. This does not
  register a Telegram webhook or qualify delivery with a real bot.
- The worker no longer unconditionally fails QUEUED/RUNNING executions when a
  legacy job throws: it may fail only a never-started initial run or a queued
  continuation matching its nonce. A claimed run is left to lease maintenance,
  whose scan interval is now one minute (retention remains hourly), with an
  overlap guard. Source tests for dispatch and overlapping scans are unrun.
  Maintenance must remain enabled; a legacy queued continuation that failed
  before claim cannot be proven to belong to that job and still needs operator
  investigation. This does not fence old deployed workers or reclaim an
  already issued provider request.
- RSS uses an execution foreign key with `ON DELETE SET NULL`, leaving the
  item receipt when terminal history is pruned. A disposable-database source
  test now deletes a synthetic terminal execution and checks that the same
  retained item does not create another run; it remains unrun. This protection
  ends when the separately bounded RSS receipt retention expires.
- Read-only GitHub Actions inspection found production deployment run
  `41464476015` succeeded for base `3c9ac35560126d6f7240f428efe0734275896218`.
  That is the last observed successful workflow run, not proof of current live
  container state or evidence that any NX draft was deployed.
- GitHub merge now accepts an optional, full expected head SHA and rejects a
  provider 409 without retry; existing graphs without it retain their merge
  payload. GitHub write transports and generic HTTP writes now reject redirect
  replay and report an uncertain outcome after a write redirect. Synthetic
  adapter tests were added but are unrun. An SHA guard reduces stale-head risk;
  it does not replace repository protections, approval or provider review.
- Coordinator added a draft Vercel account-webhook deployment trigger using
  an imported, encrypted signing secret distinct from the discovery API token.
  It authenticates raw-body HMAC, filters event/project and team or personal
  scope, stores bounded output, detects same-ID payload conflicts, and uses
  initial-only queue recovery. The endpoint is configured manually in Vercel;
  local state does not certify remote registration or provider eligibility.
  Count-based history cleanup now retains Vercel delivery executions for at
  least 24 hours after completion, so the configured count ceiling can be
  temporarily exceeded. Exact dedup still depends on the vault key and retained
  history. Protocol, ingress, disposable-DB (`FLUXORA_VERCEL_INTEGRATION=1`)
  and mocked browser cases are written but unrun. Contracts were rebuilt to
  keep the local preview available; this was not final verification. Mixed
  fleet, rollover and live provider qualification remain unresolved.
- Apart from the isolated worker checks noted above, no tests or full verify
  have run. Contracts were rebuilt when node versions changed to restore the
  local preview after its dashboard returned HTTP 500. A second local 500
  after merging the distinct node types came from a syntax error in the node
  library; this was corrected and both endpoints returned HTTP 200. These
  checks do not replace final verification.
  Continue implementation before the quality gate.
- `apps/web/next-env.d.ts` was already modified before this goal and must stay
  outside commits. Local web/API were healthy on ports 3000/3001 at startup.
