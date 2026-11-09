# Agent Current State Gate

This file is the compact, machine-checked handoff point for the next coding
loop. It prevents an agent from proposing implementation work that is already
complete in the delivery ledger.

## Active approved batch — 2026-11-09

- Released baseline: PR #113, commit `912ad05`; main Quality gate
  `42608924824` and deployment `42610611727` succeeded. Dashboard/Admin UX
  and two-input Append Merge are already released; do not implement again.
- Owner approved Aggregate/Split Out, Sort/Limit and matching-key Merge, typed
  Notion database writes and GitLab actions/triggers. Implement as one batch;
  audit and verify at the end, then one develop→main PR and merge. No additional
  Slack/Calendar permission changes or live qualification are included.
- Implementation and final local audit/verify are complete: 1,131 API tests
  passed (one optional Riot test skipped), 75 web tests and 224 E2E passed.
  Both themes were visually reviewed. One additive GitLab enum migration was
  applied locally; existing data and credentials are preserved.
- Release is delivered through the single develop→main PR associated with this
  commit. Check that PR and its main/deploy runs for release status; do not
  repeat this implementation from an older snapshot. No real Notion write or
  GitLab event/account qualification is claimed. See docs/47 and the batch report.

## Historical pre-release snapshot — 2026-11-09 (superseded by PR #113)

- Released baseline: PR #112 merged as `07ec915`. PR Quality gate
  `42593602113`, main Quality gate `42595607603` (221 E2E) and production
  deploy `42597185351` succeeded. Separate Admin navigation, Slack signed
  message/mention triggers, mapping source selection and failed-node inspection
  are released; do not implement them again from older pre-release notes.
- Current owner-approved batch is implemented and locally checked: dashboard
  spacing, shared section headers, semantic status colors and factual 24h
  distribution; Admin contextual links and actor/date/target audit filters;
  two-input ordered Append Merge with empty/conditional/error/approval-resume
  handling. Includes prior Admin menu fix `2de44e5`. API 1,114 and web 75 tests
  passed. Full E2E had 221 passes and two new fixture/locator failures; both
  corrected cases passed the focused rerun. A clean full CI gate is required
  before merge. Check the PR associated with this commit for release/deploy
  status; do not propose reimplementing these completed features.
- Real Slack Trigger testing remains deferred by the owner: do not change scopes
  or Events URL. Read-only production Connections inspection on November 9 still
  shows “Enable Slack triggers”; sending/OAuth evidence does not qualify events.
- Calendar updated-event qualification passed locally on November 9: one
  controlled update produced a successful execution and a second poll no
  duplicate. The temporary workflow was made inactive and event deleted. Current
  read-only production inspection found no Google Calendar connection or Calendar
  test workflow. Production polling requires that connection; do not claim it has
  passed or repeatedly run the already-completed local qualification.
- See task `.agent/tasks/2026-11-09-dashboard-admin-merge.md` and architecture
  section “Two-input Append Merge” for the exact current batch boundaries.

## Previous snapshot — 2026-11-08

- PR [#107](https://github.com/phuuthanh-dev/fluxora/pull/107) merged as
  `7e2efd4`; its PR/main checks passed and its production deploy succeeded on
  attempt two. Attempt one failed while the runner downloaded its SSH tool,
  before executing the deploy. The deployed web/API health checks passed.
- Steam game news uses a public bounded read without a Steam connection. The
  dashboard distinguishes explicitly disabled scheduling from database/queue
  readiness; configured scheduling is not proof of trigger health. See the
  associated release and test evidence before claiming live qualification.
- On November 8 a read-only editor visit loaded the designated Google Drive
  test file in the picker and the previously approved GitHub test repository
  and issue in their pickers. No provider action, write, or message was run.
  A fresh Google Verification Center view still showed branding verified and
  data access under review; no approval or follow-up request was shown.
- The owner updated the Steam report and authorized publishing v7 plus one
  manual live execution. On November 8 at 16:55 Asia/Ho_Chi_Minh it succeeded
  for all five nodes. The owner then requested a daily 17:16 schedule; v8 was
  published with `16 17 * * *` in `Asia/Ho_Chi_Minh`. Its scheduled execution
  on November 8 at 17:16 succeeded for schedule, Steam, Google Chat, Discord
  and Telegram. This is one scheduled run, not proof of sustained reliability.
  Do not manually repeat sends without specific authorization.
- The editor now gives targeted recovery guidance for a Google Chat incoming
  webhook returning the stored `HTTP_ERROR` 403 message in both node details
  and the timeline. It suggests checking the webhook and its space without
  asserting a specific cause; failure classification and retries are unchanged.
- The VPS has a 15 GiB disk with about 2.5 GiB free; the deploy preflight
  requires 2 GiB free. `docker system df` reported only 5.602 MB of image
  space reclaimable. The provider and the price or feasibility of a larger
  disk are not yet confirmed. No volume, image or user data was removed and
  no infrastructure change or purchase was made. Increasing storage is the
  preferred option to investigate rather than assuming unused volumes are safe.

- PR [#105](https://github.com/phuuthanh-dev/fluxora/pull/105) merged as
  `49769d74ebee39204405f0ba635633e7516a8015`; its PR and main quality gates
  passed and [production deploy](https://github.com/phuuthanh-dev/fluxora/actions/runs/42389440622)
  succeeded. On November 8, web/API/worker used this image and API/web were
  healthy. This does not imply workflows succeed.
- Production execution history shows Steam daily report v6 failed on November
  6, 7 and 8 at 13:05 Asia/Ho_Chi_Minh with Google Chat 403. The November 8
  run shows schedule and Steam succeeded while Discord/Telegram were skipped.
  The 403 alone does not establish why Google denied the webhook. The
  message also references obsolete Steam output paths and yields blank fields.
  The owner initially chose inspection and repair guidance only; the later v7
  publication and single test were separately authorized as recorded above.
  See `docs/35`.
- Google Cloud Verification Center was refreshed on November 8: branding is
  verified and data access remains under review. The Google Chat webhook is a
  separate credential from Google OAuth; the 403 does not prove the OAuth
  review caused the failure. No new AI provider call was made; production
  connection inventory did not show Gemini or OpenAI in this workspace.
- Read-only VPS check: 2,623,320 KiB free versus the 2,097,152 KiB preflight
  minimum, leaving 526,168 KiB headroom. Images reported only 5.602 MB
  reclaimable; volumes may contain user data and must not be pruned. Expanding
  storage is a candidate to investigate, not an applied change or a guarantee
  of successful deploy. Backup/restore remains deferred by the owner.

### Previous snapshot — 2026-11-07

- The owner-approved local Google Drive qualification workflow was run through
  the editor in live mode on 2026-11-07: the manual trigger and the designated
  test-file download succeeded and the node input/output was inspectable. The
  workflow was deactivated afterward. This is one read on local, not Google
  verification, a production check, or evidence for other operations. The
  Steam snapshot now gives an actionable, non-retryable 401/403 error for
  required profile/library requests, consistent with other Steam operations;
  the error behavior is covered with synthetic provider responses.
- A read-only VPS check on 2026-11-07 found about 2.43 GiB free, production
  web/API/worker healthy at `d2867d0`, and only about 106 MiB reclaimable from
  images as reported by Docker. This is a point-in-time observation, not a
  guarantee the next build will fit. No images or volumes were removed. Backup
  and restore remain deferred at the owner's request.

- [PR #103](https://github.com/phuuthanh-dev/fluxora/pull/103) merged as
  `d2867d024174f0a30fcc16a43a1328363931eb8a`; its PR and main quality gates
  passed. The editor exposes separate, accessible input/output format controls
  and avoids claiming a queued mock node already ran. The local final gate
  passed 1,070 API tests, 73 web tests and 215 browser tests; one unrelated
  Riot integration test was skipped. Eight existing Steam reads succeeded
  directly against the owner's account; this did not run a live workflow.
- Its [production deploy](https://github.com/phuuthanh-dev/fluxora/actions/runs/42380423420/attempts/2)
  passed on attempt two after the owner explicitly authorized removing the two
  unused `4d394da` rollback images to clear the failed disk preflight. VPS
  inspection confirmed web, API and worker using `d2867d0`; landing, login,
  API health and readiness returned HTTP 200. These checks do not establish
  workflow or provider health. Preserve database, volumes and rollback images
  unless the owner authorizes a specific cleanup.
- Google Cloud Verification Center showed verified branding and data access
  under review on 2026-11-07. Other connector evidence remains scoped to the
  individual provider operations and dates in `docs/35` and `docs/45`.
- A short synthetic prompt succeeded through the local live Gemini adapter with
  the owner's existing connection and `gemini-3.1-flash-lite`. This does not
  qualify all models, structured output or production behavior.
- A read-only walkthrough on 2026-11-07 used an existing synthetic local user
  to inspect password sign-in, the dashboard and Connections. The existing
  `editor-onboarding` and `execution-observability` browser cases cover editor
  creation, mock runs, result inspection and synthetic failure routing; their
  prior pass does not establish a new live workflow or notification delivery.

- [PR #100](https://github.com/phuuthanh-dev/fluxora/pull/100) merged as `b7504edae866ebe4e7d326e7ff684266131ff17f`; its PR and main quality gates and [production deploy](https://github.com/phuuthanh-dev/fluxora/actions/runs/42334400678) passed. The code graph now records directory imports resolved through index files, the old theme storage-key fallback was removed, and workspace hygiene guidance was updated. The isolated local gate passed 1,071 API, 73 web and 215 browser tests with synthetic providers. Health and deployment evidence is point-in-time, not proof of current provider or database health.

### Earlier snapshot — 2026-11-06

- [PR #99](https://github.com/phuuthanh-dev/fluxora/pull/99) merged as `4d394da67b445ff6e4649b583d966d4ea27aa2bb`; its PR and main gates and [production deploy](https://github.com/phuuthanh-dev/fluxora/actions/runs/42230222612) passed. It explains existing mock behavior and key-based history filtering using shared metadata; that metadata does not enforce redaction or establish live-provider behavior. The isolated local gate passed 1,071 API tests, 73 web tests and 215 browser tests with synthetic providers. Deployment and health checks are point-in-time evidence, not continuing proof of provider or database health. PR #98 contained the preceding documentation audit.

The entries below are dated release history, not the current deployed revision.

- [PR #97](https://github.com/phuuthanh-dev/fluxora/pull/97) merged as `398e397f7805ba3dfe027f2451af30c21eda993e`; PR/main CI and [deployment](https://github.com/phuuthanh-dev/fluxora/actions/runs/42217626999) passed. Production web/API/worker run this commit; landing, login, health and readiness returned HTTP 200. The isolated local gate passed 1,069 API tests (including Riot database integration; no API skips), 73 web tests and 215 browser tests. No real provider was exercised. The release refreshes execution status after an authorized SSE connection/reconnection, corrects item error/list guidance, adds synthetic end-to-end coverage, and updates this NX audit. Redis events lost while SSE remains connected are not replayed.

- [PR #96](https://github.com/phuuthanh-dev/fluxora/pull/96) merged as `42d42865e51510f6bf72c1054ccec35ff5da2870`; PR/main CI and [deployment](https://github.com/phuuthanh-dev/fluxora/actions/runs/42202455357) passed. Production web, API and worker run this image; landing, login, API health and readiness returned HTTP 200. Local verify passed 1,067 API tests (one skipped), 73 web tests and 214 browser tests on synthetic data. No live provider was tested. With an Error edge, failed items route to Error and other items to Success; without one the run stops. Fatal limits/internal errors still stop; joins and approvals after item sources remain unsupported. Do not implement this slice again.

- [PR #95](https://github.com/phuuthanh-dev/fluxora/pull/95) merged as
  `34204082407687b3cc8855c0e27d3e6a6aa1e5a7` after PR and main CI passed;
  [deployment](https://github.com/phuuthanh-dev/fluxora/actions/runs/42186760985)
  succeeded. Production web, API and worker ran this image; landing, login,
  health and readiness returned HTTP 200. Local `npm run verify` passed 1,052
  API tests (one skipped), 73 web tests and 214 browser tests with synthetic
  data. No live provider was tested for this release.
- PR #95 restores a list source's existing error branch when the source fails
  before producing items, including malformed or over-limit output. At that
  release per-item action error branches were unsupported; PR #96 added them.
  Do not repeat this fix.
- [PR #94](https://github.com/phuuthanh-dev/fluxora/pull/94) merged as
  `6b2cd5948ebde884f0abd8bd83851451edc188d2` after its PR and main gates
  passed. [Production deployment](https://github.com/phuuthanh-dev/fluxora/actions/runs/42179889730)
  succeeded; web, API and worker used this image, and landing, login, API health
  and readiness returned HTTP 200. The isolated local `npm run verify` passed
  1,045 API tests (one skipped), 73 web tests and 214 browser tests. No live
  provider call was made for this qualification.
- PR #94 routes bounded list items through If and Switch, preserves original
  item data and immediate parent links, and skips empty branches. Joins,
  approvals and action error branches after item sources were unsupported at
  that release; PR #96 added action error routing. The 100-item and 1 MB limits
  remain. It also prevents runner-only `executeOnce` from reaching
  PostgreSQL/Supabase adapters. Do not implement this batch again.
- [PR #93](https://github.com/phuuthanh-dev/fluxora/pull/93) merged as
  `240b6ee5ce476e0fa1dee9e718c6aea18861869a`; the PR and main quality gates
  passed and [production deployment](https://github.com/phuuthanh-dev/fluxora/actions/runs/42172497321)
  succeeded. Web, API and worker ran this image; public landing/login and API
  health/readiness returned HTTP 200. Local `npm run verify` passed 1,034 API
  tests (one skipped), 73 web tests and 214 browser tests with synthetic data.
  This is point-in-time evidence, not qualification of live providers.
- PR #93 corrected repeated summary notifications from five newly created
  data-read-to-Chat templates by setting their action to process only the first
  input item. The optional setting is available in the action's Advanced panel;
  previously saved workflows are unchanged and must be updated and republished
  if the behavior is desired. An empty item list does not run the action. Do not
  implement this fix again; NX-07's single-path limitations still apply.
- [PR #92](https://github.com/phuuthanh-dev/fluxora/pull/92) merged as
  `a2285e488a08a4754557ac7468c2f39cd06fb9da`; its
  [PR gate](https://github.com/phuuthanh-dev/fluxora/actions/runs/42150543062)
  passed. The [main gate](https://github.com/phuuthanh-dev/fluxora/actions/runs/42152146473)
  passed. [Production deployment](https://github.com/phuuthanh-dev/fluxora/actions/runs/42153611664)
  succeeded on attempt 2, after the owner approved removing the unused rollback
  image pair `166ff404` following an insufficient-disk failure on attempt 1.
  Production API, worker and web ran `a2285e4`; migration
  `20261106100000_node_execution_items` applied, readiness, landing and login
  checks passed. These checks do not qualify live providers. The local isolated
  gate passed 1,015 API tests, 73 web tests
  and 214 Playwright tests; 17 conditional API tests were skipped locally. A
  separate synthetic PostgreSQL check exercised a workflow and two item records.
- PR #92 implements bounded automatic list-item execution along a single path
  of action nodes, per-item execution history, safe `$json` expressions and
  editor run-state indicators; it also corrects Google resource validation.
  This is not full n8n item parity. Branches, conditions, joins and approvals
  after a list are rejected, and supported lists are limited to 100 items and
  1 MB. No real-provider qualification follows from the mock tests.
- [PR #91](https://github.com/phuuthanh-dev/fluxora/pull/91) merged as
  `31a1637acd28343358352692448d32e43978833e`; its
  [PR gate](https://github.com/phuuthanh-dev/fluxora/actions/runs/42081700786),
  [main gate](https://github.com/phuuthanh-dev/fluxora/actions/runs/42083785009)
  and [production deploy](https://github.com/phuuthanh-dev/fluxora/actions/runs/42085712733)
  passed. The deployment's internal health check passed and the public landing
  returned HTTP 200. The isolated local gate passed 1,024 API tests with one
  skipped, 72 web tests and 213 browser tests, using synthetic provider data.
- PR #91 released shared configuration rule entries for all 84 executable
  node types, organized by provider, and corrected the Gemini/OpenAI structured
  output controls. Entries do not prove complete field, provider, output or
  security validation. See [schema coverage](46-node-configuration-schemas.md).
  Draft templates can be incomplete; a workflow with invalid inputs may need
  correction before publication or execution. Do not implement this batch again.
- [PR #90](https://github.com/phuuthanh-dev/fluxora/pull/90) merged as
  `166ff404d9a30a11d48a387643784b9f6c3ed819`. Its [PR gate](https://github.com/phuuthanh-dev/fluxora/actions/runs/42054698344),
  [main gate](https://github.com/phuuthanh-dev/fluxora/actions/runs/42057337713),
  and [production deployment](https://github.com/phuuthanh-dev/fluxora/actions/runs/42059277966)
  passed; deployment succeeded on attempt 2 after owner-approved removal of the
  unused rollback images. Production web/API/worker ran this image; landing,
  login, and VPS API health/readiness returned HTTP 200. This does not qualify
  every provider. The isolated pre-merge gate passed 996 API, 72 web and 213
  Playwright tests using synthetic data.
- For the concise current NX inventory, owner direction and outstanding work,
  see [current audit](45-nx-current-audit.md). Older dated entries below are
  evidence of their own snapshots, not instructions to reimplement them.
- [PR #89](https://github.com/phuuthanh-dev/fluxora/pull/89) merged as
  `d22dd018851e066595ff7337556eaa279b968869`; its [PR gate](https://github.com/phuuthanh-dev/fluxora/actions/runs/42017532464), [main gate](https://github.com/phuuthanh-dev/fluxora/actions/runs/42019435840) and [production deploy](https://github.com/phuuthanh-dev/fluxora/actions/runs/42021280239) passed. At the post-deploy check the homepage, login, API health and readiness returned HTTP 200. This is not provider qualification.
- The owner directed one unsuffixed node implementation per operation; parallel
  `.v2` types and numeric node versions were removed in PR #89. Graphs using
  removed types require recreation; unsuffixed nodes use current behavior. No
  workflow or credential records were deleted by the change. Workflow publish
  versions and execution snapshots remain separate. Local isolated verify
  passed 990 API, 72 web and 214 Playwright cases using synthetic providers.
- PR #89 also released the publish-time cron and static choice guards and the
  PostgreSQL, MongoDB and Supabase credential-echo guards. These use synthetic
  tests, do not prove all validation or detect encoded/partial credential echoes,
  and can reject a legitimate exact password match. See the historical
  [validator inventory](44-nx-validator-audit.md); its counts and unresolved
  observations predate node consolidation and require rechecking.
- NX runtime correctness, including invalid If/approval choice handling and
  static approval provider preflight, shipped in PR #90; do not implement it again.
- A later unrelated retry/timeout experiment remains uncommitted on
  `codex/nx-node-runtime-settings`. The owner stopped that expansion. Do not
  continue, discard, verify or include it in a PR without a new instruction.
- Current registry source contains 84 executable types and five planned types
  (Facebook, Instagram, Valorant, Legends of Runeterra and 2XKO); none uses a
  `.v2` suffix. These counts describe dispatch capability, not complete app
  coverage or live qualification. Steam's snapshot composes multiple API calls
  into a report while its operation node exposes individual reads: their inputs
  and outputs differ, so they are not a duplicate V1/V2 pair. OAuth and webhook
  code still has some legacy paths; this inventory does not justify deleting
  real credentials, webhook registrations or user data.
- The editor's mock run can succeed without validating a real connection or
  every live input. The explanatory follow-up shipped in PR #90.
- A historical PR #90 local verify attempt stopped in deployment checks because the disposable
  database name lacked the required `test` substring (57 passed, two test
  guards failed); it is not a successful quality gate. Following audit and
  corrections, final isolated `npm run verify` passed 996 API, 72 web and 213
  Playwright tests, including the approval database integration. Provider calls
  were synthetic; the batch subsequently shipped in PR #90.

- NX-06 cost-control review: per-request prompt/output limits and structured
  output are deployed; an aggregate monetary cap is not. The owner has been
  asked whether to rely on provider controls or design a separate Fluxora
  budget. Do not implement or claim a hard spend cap until that choice is made.
  Provider documentation notes enforcement or reporting delays; see
  [cost controls](39-nx06-ai-cost-controls.md).

- [PR #88](https://github.com/phuuthanh-dev/fluxora/pull/88) merged as
  `a2734f5cc3a9600f60e848750fbbe01b22bafc1d`; the [PR gate](https://github.com/phuuthanh-dev/fluxora/actions/runs/41983355671),
  [main gate](https://github.com/phuuthanh-dev/fluxora/actions/runs/41985095176)
  and [production deploy](https://github.com/phuuthanh-dev/fluxora/actions/runs/41986739676)
  succeeded. Production landing, login and the API subdomain's health/readiness
  returned HTTP 200; local web/API also returned 200. This is a point-in-time
  smoke check, not provider qualification. Calendar event picker pagination,
  Trello and Google output safety and associated tests shipped; do not redo.
  PR CI passed 222 E2E, 1,000 API and 80 web tests; one Riot integration was
  skipped in CI but passed in the separately configured isolated local run.
  The two full local runs were not green; see the next entries for details.

- Isolated `npm run verify` at `66f13af` passed 1,001 API tests including
  the Riot PostgreSQL integration, 80 web tests and typecheck/build, but
  Playwright had 220/222 passes. The editor loading and guided Connections
  tests timed out while pages were loading; both passed in the previous full
  run and on a targeted retry. The Calendar pagination case passed in this
  full run. Root cause of the intermittent timeouts is unproven; do not treat
  targeted retries as a passing full gate. Independent PR CI later passed.

- Isolated `npm run verify` at `236fa1a` passed 1,000 API tests (one Riot
  database integration skipped), 80 web tests, typecheck/build and 221/222
  Playwright cases. Calendar picker E2E assumed a fixed request index; that
  assertion was corrected at `6561561` and the case passed in isolation. The
  skipped Riot database integration also passed separately. The corrected
  commit later passed independent PR CI and was released in PR #88.

- Released in PR #88, NX-05: the existing disposable-Postgres
  Telegram delivery integration test now covers out-of-order update IDs,
  recovery of an accepted queued execution without requeueing a started one,
  and rejection after deactivation. It passed at `236fa1a` and does not
  establish provider delivery behavior or exactly-once processing.

- Released in PR #88, NX-02: the existing configured-mock
  contract matrix now includes all registered action node types and checks
  advertised output fields, except the conditional Trello pagination warning.
  The matrix passed at `236fa1a`; it does not prove live provider
  behavior, all operation variants, runtime schemas or secret redaction.

- Released in PR #88, Google Drive/Sheets output audit: existing adapters
  now inspect response strings and keys for the current access token, including
  Drive text and Sheets cells. A write whose response contains the token is
  reported uncertain rather than retried. Synthetic API tests passed at
  `236fa1a`; no live Google call. Exact token matches in legitimate data are rejected;
  partial, encoded or other secrets are not covered.

- Released in PR #88, Trello safety audit: the existing create-card POST
  now uses the no-write-redirect transport and reports an uncertain outcome
  for redirects, timeouts, 429 and 5xx; it does not automatically retry.
  Discovery and the created-card output reject current credential echoes before
  truncation; after a write this reports uncertainty. Synthetic API tests passed
  at `236fa1a`. No live Trello request was made for this change.

- Released in PR #88: Calendar event picker can request additional
  pages using the original `timeMin`, reset when its calendar/connection
  changes, and retain manual ID entry. Synthetic API and editor tests are
  written; the API tests passed and E2E passed after correcting its request
  assertion; independent PR CI passed and the change was deployed. Search
  filters loaded pages only; a hint now says so when more are available across
  paginated pickers. Added synthetic coverage for owner denial and switching
  accounts after pagination. Do not mistake this picker work for changing
  workflow execution or for live Google qualification.

- [PR #87](https://github.com/phuuthanh-dev/fluxora/pull/87) merged as
  `74edb7972b72c2b105c2466b9e4a9533582f7ec6`; its [main gate](https://github.com/phuuthanh-dev/fluxora/actions/runs/41971975320)
  and [production deploy](https://github.com/phuuthanh-dev/fluxora/actions/runs/41973158195)
  succeeded. Landing, login, API health and readiness returned HTTP 200 after
  deploy; this does not qualify provider operations. Bounded Notion/Drive/Gmail
  pagination and Drive metadata/folder actions shipped. Do not reimplement them.
- Full isolated `npm run verify` passed at `d51d100`: 994 API tests, 80 web
  tests and 221 Playwright tests, plus harness, typecheck and build. Database,
  Redis, credentials and provider responses were synthetic. This batch was
  deployed in PR #87; the result does not qualify live Google, Gmail or Notion.
- Isolated verify at `99ebca0` passed 994 API and 80 web tests, typecheck and
  build; Playwright had 220 passes and one failure because an onboarding test
  hard-coded the former one-operation Drive label. The selector was fixed and
  the complete gate passed on `d51d100`.
- Isolated final verify at `70a00cb` passed the API and web test stages but
  stopped at API typecheck: `continuation.preserve` may be undefined in a new
  metadata test. A test-only correction was included in the later passing gate.
- Released in PR #87: separate Drive get-file-metadata and
  create-folder actions with Google workspace credential readiness, a picker
  that includes non-text files, and mock/transport tests. Folder creation has
  no automatic retry when outcome is uncertain. It has not been tried against
  Google; new node types must not be published while old workers are running.
  The Drive `root` alias is accepted as a folder ID; picker IDs and aggregate
  auto-paginated output are bounded. These checks passed the isolated gate.
- Released in PR #87: optional bounded Gmail read pagination,
  at most five list requests and ten message-detail requests. It does not alter
  the Gmail trigger; `hasMore` and the continuation token signal more data.
  Tests use synthetic transport; no live Gmail request was made for this work.
- Released in PR #87: optional bounded collection for Drive
  list/search, up to five requests and 100 files. It retains the next page token
  if more may exist; short and empty pages do not imply completion. The normal
  single-request default and upload/download behavior stay unchanged. Tests use
  synthetic transport; no live Google Drive request has been made for this work.
- Released in PR #87: opt-in bounded multi-page Notion search
  on the existing paginated node. Up to five read requests and 100 results;
  `hasMore`/`nextCursor` signal remaining results. Old nodes and the default
  single-page behavior remain unchanged. Synthetic tests passed the isolated
  gate; no real Notion call was made for this change.
- [PR #86](https://github.com/phuuthanh-dev/fluxora/pull/86) merged as
  `08827f4d39620065e01c1a1e66ff572a4981e3d7`. Its [main gate](https://github.com/phuuthanh-dev/fluxora/actions/runs/41952346345)
  and [production deployment](https://github.com/phuuthanh-dev/fluxora/actions/runs/41953773213)
  succeeded; landing, login, API health and readiness returned HTTP 200 after
  deploy. This point-in-time smoke check does not qualify live providers.
  At that time consolidation was deferred; the owner has since requested it. Do not repeat the
  cursor, numeric field or provider-output work from this PR.
- After PR #85, isolated `npm run verify` at `d876cbb` passed 980 API, 80 web
  and 217 Playwright tests. This local batch covers Notion property cursor
  resets, numeric default UX and guards against current-credential echoes in
  Reddit, Calendar and Gmail output; provider tests use mocks. It also blocks
  persisted lowercase redaction markers in expressions. The batch was deployed
  in PR #86. Trigger processing can stop on a token echo; a literal redaction
  marker can be rejected after persistence. Do not treat this verification as
  live provider qualification.
- [PR #85](https://github.com/phuuthanh-dev/fluxora/pull/85) merged as
  `40d9aa04dda858a9b3f318d40f6e9242f84776b6`; its [main gate](https://github.com/phuuthanh-dev/fluxora/actions/runs/41943156831)
  and [deployment](https://github.com/phuuthanh-dev/fluxora/actions/runs/41944819012)
  succeeded. Landing, login, API health and readiness returned HTTP 200 after
  deployment; these checks do not qualify provider operations. Shared fields
  now preserve and correctly display unset selections, numeric expressions and
  non-boolean checkbox values. The isolated gate for the same source passed
  972 API, 80 web and 216 Playwright tests. Do not implement these changes again.
- After PR #85, the local editor clears a Notion property pagination cursor
  when the selected property changes; the existing picker E2E now covers both
  list selection and manual ID entry. The batch passed final verify at
  `d876cbb` and was deployed in PR #86. PostgreSQL/Supabase intentionally retain selection
  settings when their table changes, with a warning; do not silently clear them.
- [PR #84](https://github.com/phuuthanh-dev/fluxora/pull/84) merged as
  `ff4302dbf2e48618b1721770975666a094aaa2c8`. Its [PR gate](https://github.com/phuuthanh-dev/fluxora/actions/runs/41926442270),
  [main gate](https://github.com/phuuthanh-dev/fluxora/actions/runs/41927994423)
  and [production deployment](https://github.com/phuuthanh-dev/fluxora/actions/runs/41929879005)
  passed. Landing, login, API liveness and readiness returned HTTP 200 after
  deployment; this is a point-in-time smoke check, not provider qualification.
  Guided Drive search, upstream expression suggestions and the persisted
  redaction guard shipped; do not reimplement them. Full isolated verify at
  `10f1dba` passed 972 API, 80 web and 214 Playwright tests. No real provider
  credentials were used during that verification.
- [PR #83](https://github.com/phuuthanh-dev/fluxora/pull/83) merged as
  `3128cc661320ad38eff43f759c71ffbad5010346`. The [main quality gate](https://github.com/phuuthanh-dev/fluxora/actions/runs/41913745808)
  and [production deploy](https://github.com/phuuthanh-dev/fluxora/actions/runs/41915564897)
  succeeded. Landing, login and API health returned HTTP 200 after deploy.
  This smoke check does not qualify every provider or workflow.
- NX-02 through NX-07 have substantial implementation or design already in
  production. Do not start them again from the 2026-11-02 baseline below;
  check the current source and the latest table in [docs/37](37-node-expansion-audit.md).
  The remaining gaps include per-operation validation/mock/redaction evidence,
  provider qualification and capabilities deliberately deferred in NX-07.
- Before PR #84, a previous full verify at `c2d6367` passed 971 API, 78 web and
  214 E2E; its scope is superseded by the later verified snapshot above.
- The owner requested one consolidated verification and release, to avoid
  repeated small PRs. The later owner decision removes parallel `.v2` node
  types and numerical node versions; old graphs need not remain compatible.

## Historical verified snapshot — 2026-11-02

- NX-01 implementation under `APP-EXPANSION-1` respects explicit adapter retry
  denial, distinguishes SMTP accepted/partial/uncertain submission, and bounds
  HTTP/Drive/Sheets responses. Existing unsafe ambiguous write retries are
  disabled across HTTP, Google/GitHub writes and notification adapters. Three
  isolated implementation agents were integrated by the coordinator; no real
  provider calls or credential changes. Final isolated verify passed: API 521
  tests/subtests, web 32, E2E 147. Verification/release evidence:
  `.agent/reports/2026-11-02-connector-delivery-safety.md`. Broader app expansion
  remains pending; NX-02 metadata/versioning is next, not reimplementing NX-01.

- Owner-requested parallel app/node expansion audit at `04d67b6` is recorded in
  `docs/37-node-expansion-audit.md`. Inventory: 25 catalog apps, 46 node types,
  44 executable (including six core types), two planned Meta/Instagram types.
  Three read-only auditors covered Google, communication/productivity and
  data/DevOps; coordinator covered shared architecture, HTTP and AI. This is
  an audit, not implementation or new live qualification. Priorities are
  write-retry semantics/payload bounds, then typed metadata/versioning and
  pagination, then useful operation depth and durable triggers. Do not repeat
  existing node-library, Calendar CRUD or initial connector implementations.
  Final documentation validation belongs to
  `.agent/reports/2026-11-02-node-expansion-audit.md`.

- Owner-requested `L8.4` reopen adds a shared glass sidebar to Dashboard,
  Connections, Executions and Account; the editor retains its guarded header.
  Final isolated verify passed: API 355, web 32, Playwright 147. Synthetic
  light/dark, compact/expanded/mobile screenshots and a transition recording
  were reviewed. This is a video-inspired Fluxora adaptation, not exact visual
  equivalence or a provider qualification. See `docs/36-workspace-sidebar.md`
  and `.agent/reports/2026-11-02-dashboard-sidebar.md`; release status belongs
  to the resulting develop-to-main PR and its deployment checks.

- PR [#71](https://github.com/phuuthanh-dev/fluxora/pull/71) merged as `6f09d8f`; PR/main quality gates and [production deployment](https://github.com/phuuthanh-dev/fluxora/actions/runs/41440411080) succeeded. In the production editor, opening planned Instagram focused the unavailable operation, no favorite control appeared, and Escape returned focus to the app. A ready operation showed an app-specific favorite label. These checks do not establish every device, theme or provider operation.

- Local node-library favorites follow-up hides favorite actions for unavailable planned operations and identifies the app in favorite control labels. Isolated full verify passed (API 355, web 32, Playwright 145); PR #71 was deployed. An initial naming collision caused six E2E failures before the label was revised and the affected journeys passed. See `.agent/reports/2026-11-02-node-library-favorites.md`.

- Local node-library keyboard follow-up fixes focus when opening roadmap-only apps and prevents category toggles from triggering app-list arrow navigation. Isolated verify passed: API 355, web 32 and Playwright 145, including the keyboard journey. PR #71 was deployed; see `.agent/reports/2026-11-02-node-library-keyboard-focus.md`.

- A public GitHub CLI releases Atom feed exposed a missing-content case: its entries use `content` without `summary`. An RSS adapter follow-up supplies bounded `content` as the existing summary only when description and summary are absent. PR #70 merged and deployment succeeded; a manual production LIVE workflow read three entries from the public GitHub CLI releases Atom feed with nonempty summaries. The test workflow was deactivated afterward. Isolated verify passed: API 355, web 32 and Playwright 145. See `docs/35-connector-coverage-and-discovery.md`.

- After the Trello production credential rotation, a manual LIVE run of the designated Trello test workflow created one clearly labelled card in `Fluxora connector test` / `To Do`. Both the node and execution succeeded; the workflow was deactivated afterward and the card and execution history remain. This confirms one production create at that time, not repeat-delivery safety or sustained operation; see `docs/35-connector-coverage-and-discovery.md`.

- PR [#69](https://github.com/phuuthanh-dev/fluxora/pull/69) merged as `64e9e66`; its PR and main quality gates and [production deployment](https://github.com/phuuthanh-dev/fluxora/actions/runs/41426085890) succeeded. Production home, login, API health and readiness and local web/API returned HTTP 200 after deployment. The new deploy qualification accepted the verified commit. These checks are point-in-time evidence, not a sustained reliability or complete GitHub scheduling test.

- After the owner rotated the Supabase production connection, the designated table appeared in the picker (1 of 1), and one LIVE run of the designated test workflow succeeded with a one-row limit. The workflow was deactivated afterward and its execution history retained. No secret was inspected. The precise discovery path and sustained behavior remain unqualified. See `docs/35-connector-coverage-and-discovery.md`.

- Local follow-up removes the two-character hint previously shown for a Reddit OAuth app client secret, which conflicts with the documented OAuth-credential exclusion. Other allowlisted opaque-token hints are unchanged. Verification and release status are recorded in `.agent/reports/2026-11-02-reddit-client-secret-hint.md`; this correction was released in PR #69.

- Follow-up direct Calendar adapter diagnostics found the designated test event and pagination in a 2030 provider page. At the 2100 test interval, the raw Google list response itself had no items or next-page token while free/busy showed busy. Two marker-verified test events were deleted. This does not establish a universal provider date limit or prove the complete UI workflow for populated pages; see `docs/35-connector-coverage-and-discovery.md`.

- An owner-authorized local Calendar test event produced a successful busy-interval result, but List upcoming events unexpectedly returned an empty page with `hasMore: false` for the far-future test range. The exact cause is unknown; do not claim a fix or a successful populated-list test. The test event was deleted, and all three qualification workflows were deactivated. See `docs/35-connector-coverage-and-discovery.md`.

- A separate owner-authorized local Calendar read-only workflow successfully listed zero events after a future test date and reported a 15-minute interval as free. Both nodes and the live execution succeeded; the workflow was deactivated. Populated events, busy intervals, production and sustained behavior remain unqualified. See `docs/35-connector-coverage-and-discovery.md`.

- After the owner rotated the local PostgreSQL connection with the Supabase CA,
  a direct verified-TLS read and one manual LIVE workflow run each succeeded on
  `public.fluxora_connector_test` with a one-row limit. Schema/table discovery
  succeeded; both nodes and the execution succeeded. The test workflow was
  deactivated and its local execution history retained. Production PostgreSQL
  and sustained behavior are not qualified. See
  `.agent/reports/2026-11-02-postgres-custom-ca.md`.

- A local diagnostic of the designated Supabase test connection returned HTTP
  401 for schema discovery and HTTP 200 for a bounded one-row read with the
  same publishable key. The precise cause of the 401 and the production key's
  identity remain unknown. Local guidance now explains the distinction and
  existing options. Final isolated verify passed (API 352 and one skipped,
  web 32, Playwright 145). PR #67 merged as `c4fc52f` and deployed; a read-only
  production picker retry displayed the new guidance and preserved manual
  input, but production discovery remained unavailable at that time; the later
  post-rotation success is recorded above. Two prior full runs each
  had a different timeout which passed targeted and final reruns, with causes
  unconfirmed. See
  `.agent/reports/2026-11-02-supabase-discovery-401.md`.

- A node-library fix prevents browser preference write failures from
  blocking node addition. Favorites and collapsed categories remain usable in
  the current session. Isolated final verify passed: API 352 plus one skipped,
  web 32, and Playwright 145. An earlier navigation timeout passed twice in
  isolation and in the full rerun; its cause is unconfirmed. PR #66 merged as
  `af55a06`, both quality gates passed and production deployment succeeded.
  See `.agent/reports/2026-11-02-node-library-storage.md`.

- PR #65 merged as `87542ed`; PR and main quality gates passed and production
  deployment succeeded. Production home, login, API health and readiness and
  local web/API returned HTTP 200. The later local Supabase PostgreSQL run is
  recorded above. See `.agent/reports/2026-11-02-postgres-custom-ca.md`.

- A PostgreSQL credential enhancement accepts an optional provider CA
  while retaining verified TLS and pinned DNS. Supabase's official CA passed a
  no-credential Node TLS handshake; the later local authenticated read is
  recorded above. Full isolated verify passed (API 353, web 32,
  Playwright 144) after an earlier onboarding timeout of unconfirmed cause. The change
  was subsequently released. See `.agent/reports/2026-11-02-postgres-custom-ca.md`.

- A further isolated PostgreSQL 16 test exercised `readPostgresRows` against a
  real TLS/SCRAM server with a synthetic custom CA. A bounded read succeeded;
  missing/wrong CA, wrong hostname/password, and missing table permission were
  rejected. The test injected a loopback resolver and did not authenticate to
  Supabase or exercise the complete workflow and vault.

- Reddit's credential form and node description now warn about retirement of
  its public Data API and link to the provider timeline. This was released in PR #65;
  no Reddit access has been qualified. Isolated full `npm run verify` passed
  (API 352, web 32, Playwright 144). See `.agent/reports/2026-11-02-reddit-access-guidance.md`.

- PR #64 merged as `393c097`; main quality run `41382040879` and production
  deployment `41382980015` succeeded. The public homepage and login and the
  separate API host's health and readiness endpoints each returned HTTP 200
  after deployment. These checks do not establish sustained reliability.

- Google Cloud Verification Center was checked again on 2026-11-02: data
  access is still under review, with homepage and branding complete and five
  remaining steps in progress. Google has not reported approval; see `docs/35`.

- A newly saved local Trello connection loaded the designated `Fluxora
  connector test` board and its three lists. A manual live workflow created
  one test card in `To Do`; both node and execution succeeded, and the test
  workflow was deactivated. After the owner rotated the production credential,
  its picker also loaded the test board and all three lists. No production
  card was created; other operations and sustained reliability remain untested.
  See `docs/35` before repeating the provider write.

- After the owner reported updating the local Supabase connection, the table
  picker listed the designated test table and a manual live run successfully
  returned one row. The test workflow was deactivated afterwards. A subsequent
  bounded live diagnostic confirmed the Management token is present and that
  the existing safe transport reached `api.supabase.com` and returned the test
  table; only booleans and the table count were output. This does not establish
  production Management API access. See `docs/35` before repeating work.

- PostgreSQL select runtime read a synthetic local PostgreSQL 16 table over
  verified TLS with SCRAM authentication, a test-only DNS resolver and a
  credential-service stub. It enforced the row limit and rejected invalid
  authentication, missing table permission and a mismatched certificate. This
  is not cloud, picker or full workflow qualification; see `docs/35`.

- PR #63 merged as `ccbf167` after PR CI passed; its main quality gate
  `41340683966` and production deployment `41341549749` succeeded. After the
  deployment, public home, login, API health and readiness returned HTTP 200;
  local web and API also returned HTTP 200. These are point-in-time checks,
  not proof of live provider access or sustained production reliability.

- PR #62 merged as `dec5b65` after its PR quality gate passed, but main quality
  run `41338466267` failed the execution-center pagination E2E; its deploy was
  skipped. The fixture used request order rather than the requested cursor, so
  a local follow-up makes its response selection deterministic. The exact
  request ordering was not captured; do not claim the production UI was proven
  defective or that PR #62 was deployed. The targeted test passed 5 consecutive
  isolated runs and full `npm run verify` passed with 144 E2E; PR #63 then
  passed GitHub CI and deployed the combined code as described above.

- The optional Supabase Management API table discovery change is released by
  PR #63's deployment; local Management API discovery succeeded after the
  owner's connection update. The
  isolated `npm run verify`
  passed after the Uptime Kuma setup-copy change, including 144 E2E tests.
  Uptime Kuma 2.5.9 and a real synthetic HTTP monitor subsequently ran against
  an isolated Fluxora API and database: DOWN and recovery executions succeeded.
  Production, TLS, retry, replay and sustained delivery remain unqualified.
  See `docs/35` for exact limits.

- PR #60 merged as `2eebdbc` and PR #61 as `2cc2537`; their production
  deployments succeeded. The RSS CDATA fix passed a production live read of
  GitHub Changelog. Vercel's 403 team fallback and personal project picker were
  observed on production. Supabase's generic-discovery fallback retained the
  test table and one subsequent production read succeeded; schema discovery
  itself remains unavailable. Trello board discovery returned 401; its precise
  authentication cause and live card creation remain open. See
  `docs/35-connector-coverage-and-discovery.md` for scope and evidence.

- PR #58 merged as `955c00c`; quality gate and production deploy succeeded.
  On 2026-11-01, the deployed web root and API liveness/readiness returned 200.
  Deploy logs show a local PostgreSQL backup and migration container completion;
  no recent restore or full workflow/credential audit is implied. Seven initial
  operations shipped; provider-specific live qualification remains outstanding.
  The subsequent RSS fix and production verification are recorded above.
- PR #56 (`develop` → `main`) merged at `bd2519d`; it includes Notion search
  and PostgreSQL select. Notion search was qualified once locally; broader
  live and production qualification remains. See `.agent/reports/2026-11-01-notion-postgres.md`.
- PR #57 merged as `2a2feb3` and its production deployment succeeded; it adds
  Gmail read and polling trigger, grouped email connection choices and Google
  Calendar operations. Full isolated verification and its
  GitHub quality gate passed on `d1d4dcd`; limited local Gmail/Calendar live
  checks later succeeded, while Google scope approval and broader qualification
  remain separate. A follow-up review
  fixed a queue-recovery edge case involving approval and passed isolated
  verification; see the associated report. Gmail Pub/Sub is not implemented.
- Do not repeat the completed MongoDB live insert qualification.

- PR #52 shipped the Google refresh-token guard at `2514147`; main quality
  run `41228624481` and production deploy `41229373344` succeeded. Public
  liveness, readiness and web root returned 200 after deploy.
- Google verification is submitted and data access is under review; Drive's
  restricted scope is not yet approved. The public consent decision and any
  required CASA assessment belong to Google and the assessment process.
- One local demo Sheets read succeeded on 2026-11-01 using the owner-approved
  synthetic spreadsheet. The managed credential's metadata timestamp changed
  inside the run; code inspection supports refresh as the explanation, but
  no token or provider response was inspected. Production refresh remains
  unverified.
- The owner-approved SMTP test message sent on 2026-10-31 was observed in the
  intended recipient's inbox on 2026-11-01. This is one Gmail-to-Gmail delivery,
  not proof of general deliverability or sustained production operation.
- Deployment logs show a PostgreSQL backup was created on the VPS on 2026-11-01
  Vietnam time. The prior isolated restore was on 2026-10-28; no recent off-host
  copy or restore evidence is available. Do not infer the cause of the reported
  missing workflows or credentials from health checks alone.
- PR #53 and PR #54 were merged. PR #54 merge `354bd4d` passed main quality
  run `41279760082` and production deploy `41280351220`. This release includes
  archive recovery, workspace activity, MongoDB Find/Insert, Google Chat OAuth
  and guided MongoDB connection/filter controls.
- With owner approval, one tagged draft document was inserted and read back in
  an owner-designated MongoDB collection; the test workflow was deactivated. The document was
  left in place. This qualifies one operation, not replica failover, private
  hosts, sustained behavior or update/delete. See `docs/20-connector-audit.md`.
- The inspector pending-edit implementation at `b5a831f` is an ancestor of
  PR #55 and current `main`; it is not an unmerged local-only change. Its
  original report records an interrupted local gate at that time, not a pass.
  Current source still contains draft preservation and action blocking; do not
  infer that every later editor scenario has been individually requalified.

The older snapshots below describe their dates and must not be read as current.

## Historical release snapshot — 2026-10-30

PR #46 merged develop → main at `3ee77fc4d1b8976282b8ec72ad2044d09c798ea8`.
Main quality run `40911982815` and deploy run `40913079403` succeeded; public login
and API readiness returned 200. The full-width dark auth header is already shipped.
This supersedes older pending-release statements below; do not repeat that work.
ACCOUNT-1 was implemented locally at `eae6b6e` after this release; it has not
been deployed. The current owner-approved L12.3 follow-up adopts the newly
supplied Relay reference and original assets on local
`codex/relay-reference-adoption`. Local validation passed: API 226/226, web
23/23 and 93/93 E2E; see `.agent/reports/2026-10-30-relay-template-completion.md`
(expanded intro/hero/fold/background/planner/footer request). Do not restart the
completed account work or earlier video-based landing reconstruction.

## How to use it

Before planning or proposing a goal, run:

```bash
npm run agent:state
```

Before handing a new task to an implementer, add the target IDs to the task
contract and run:

```bash
npm run agent:task:check -- .agent/tasks/<task>.md
```

The completed L0–L11.5 rows in `docs/06-loop-engineering.md` are closed for
new implementation. Reopening one requires an explicit `## Reopen
justification` section in the task contract with a concrete regression,
security finding, or changed requirement.

## Last audited repository state

The table and individual slice notes below are historical snapshots, not the
current deployment state. PR #31 merged and deployed as `16d53a5`; the two
production migrations noted in the earlier slices were applied. A GitHub Push
trigger-only live qualification succeeded on 2026-10-28. Consult the latest
slice report and verify the current Git/GitHub state before planning work.

The application-bootstrap repair merged as PR #35 and production deploy run
`40703958116` completed with healthy API and web readiness. This is deployment
evidence only; it does not substitute for future provider-specific smoke tests.

| Field | Value |
|---|---|
| Local base commit | `6565a3c` (subsequent changes are on `codex/webhook-registration-ux`) |
| Release PR | `#27` — merged |
| Quality gate | See individual slice reports; local verification includes pre-existing, uncommitted CI changes |
| Source tree | Current branch contains the GitHub Create Issue/idempotency, Add Label, Add Comment, Merge Pull Request operations, and the signed GitHub Issue opened, Pull request opened, Push, and Workflow run completed triggers |
| Uncommitted changes | Existing OPS edits are preserved separately; the local CI correction passed verification and still needs GitHub review |

## Closed follow-up slices

- `DASHBOARD-UX-2`, `ADMIN-1`, `MERGE-1` — implementation complete in the November 9 batch: shared dashboard spacing/status presentation, corrected Admin menus and scoped metadata/audit navigation, and exactly two-input Append Merge. Local evidence and precise limitations are in `.agent/reports/2026-11-09-dashboard-admin-merge.md`. Release remains gated on full CI; consult the associated develop→main PR for its outcome. Do not reopen without a specific regression or new owner request.

- `ACCOUNT-1` / `L14.1` (2026-10-30) — Account settings, name/password changes,
  owner-scoped session revocation and one-use email recovery implemented locally.
  Full verify: 226 API, 23 web, 86 E2E. Additive migration applied locally;
  encrypted system-mail outbox is opt-in, independent of workspace SMTP.
  No real mail, push or deployment. Activation still needs an operator-configured
  sender and explicitly authorized delivery qualification. See docs/29 and
  `.agent/reports/2026-10-30-account-recovery.md`; do not reimplement this slice.

- `P2-1` — GitHub connector vertical slices complete locally through the current acceptance boundary: separate encrypted connector credential, mock/live-guarded Create Issue, readiness, retry/error classification, idempotency, Add Label, Add Comment, Merge Pull Request, Issue opened, Pull request opened, Push, and Workflow run completed. No real provider smoke is implied; that remains owner-approved external validation.
- `WEBHOOK-REG-1` — Per-workflow GitHub signing secrets and compact editor guidance implemented locally; `npm run verify` passed (154 API, 19 web, 30 Playwright). Migration has not been applied and real delivery remains unverified.
- `GH-UX-2` — Bounded GitHub repository pagination, manual/expression fallback, and recoverable picker states implemented locally; `npm run verify` passed with 31 Playwright tests. Provider calls in tests were mocked.
- `OPS-2` — Status-based saved views scoped to user/workspace, server-side triage and retention policy visibility implemented locally. Full quality gate passed; both new migrations were applied to an isolated fresh PostgreSQL database and an isolated synthetic upgrade from `6565a3c`. Workflow, date, and mode filters remain future extensions; production migration and live validation are outstanding.
- `GOOGLE-UX-1` — Google Sheets and Drive text-file pickers use an owner-scoped server proxy. On 2026-10-28, the owner-approved configured Google OAuth connection loaded 20 spreadsheets and 100 Drive files without opening or modifying files; refresh expiry and write semantics remain unverified. See `.agent/reports/2026-10-28-google-oauth-live.md`.
- `GH-HARDEN-1` — Signed GitHub setup pings are acknowledged without running inactive workflows; repeated deliveries use registration-scoped delivery IDs. Full gate passed with mocked providers. Deduplication is bounded by execution retention and is not replay protection: the delivery header is not covered by the body HMAC.
- `WEBHOOK-VERSION-UX-1` — Registration UI uses the published trigger, warns about endpoints pinned to older versions, and blocks registration for unpublished triggers. Full gate passed with 35 Playwright tests and mocked providers.
- `WEBHOOK-ATOMIC-1` — Registration writes and audit writes share a database transaction; a synthetic PostgreSQL test confirms an audit error rolls back secret rotation. The full gate passed. A lost response after a successful commit can still require another rotation.
- `WEBHOOK-UNCERTAIN-UX-1` — An unsuccessful registration request clears the previously displayed secret, reloads endpoint status, and warns of an uncertain outcome. Playwright simulates a lost response; the full gate passed. This does not recover a lost secret or prove a still-running request has finished.
- `WEBHOOK-CONCURRENCY-1` — Workflow-row locking and observed version checks prevent concurrent app requests from silently creating duplicate registrations or replacing another rotation. Synthetic PostgreSQL and full-gate tests passed. Older clients must reload; the application lock does not constrain direct database writes.
- `WEBHOOK-SECRET-CONTRACT-1` — Owner approved a one-time GitHub signing-secret display; generic webhooks retain the same one-time model after provider comparison. The response is non-cacheable, guidance is aligned, and focused and full-gate tests passed. Existing secrets remain unavailable on later reads.
- `GH-HOOK-AUTO-1` — Provider-managed GitHub webhook status/create/delete now include a safe recorded-identity reconciliation action in the owner-scoped API and editor panel. A matching active hook can restore `DELETE_UNCERTAIN`; drift, ambiguous inspection and unknown create identity remain manual boundaries. Mutations are feature-flagged, require `PUBLIC_API_ORIGIN` in production, use only the workspace GitHub credential, and return no token, signing secret, callback URL or remote hook ID. Local lifecycle/API/browser proof is complete; live provider qualification and operator evidence remain gated.
- `CONNECTOR-AUDIT-1` — Every catalog app is now mapped to its operations, availability, credential, resource-picker, executor, and production-proof boundary in `docs/20-connector-audit.md`. The available HTTP node now exposes runtime headers through a reusable key/value Inspector field; roadmap-only nodes remain disabled. Web catalog tests 20/20, full quality gate, and Playwright 38/38 passed without provider calls.
- `CONNECTOR-FIELD-UX-1` — Google Drive hides upload-only fields until `uploadText` is selected, and Google Sheets uses a reusable table editor that preserves the existing matrix runtime payload. Web catalog tests 21/21, Playwright 39/39, and the full quality gate passed without provider calls.
- `CONNECTOR-CONTRACT-1` — Shared executable node capabilities now align the UI catalog and execution boundary while preserving schema-only roadmap imports. Web 22/22, API 198/198, Playwright 39/39, and the full quality gate passed without provider calls.
- `WEBHOOK-UI-POLISH-1` — Resource pickers separate search/select/manual entry and webhook setup is reachable from the selected trigger with published-version and multiple-draft safeguards. The owner-approved GitHub Push qualification for `phuuthanh-dev/math-util` returned HTTP 201 for the signed ping and branch push, and the pinned live trigger execution succeeded; action nodes and sustained stability remain unverified. See `.agent/reports/2026-10-28-webhook-ui-polish.md`.
- `GH-PICKER-OWNER-1` — GitHub repository picker filters loaded results by owner, preserves filtered/unloaded values, and explicitly avoids implying permissions. The provider query and credential scope were not changed; focused and full-gate evidence is recorded in `.agent/reports/2026-10-28-github-picker-owner.md`.
- `LIVE-1` — The owner-approved live smoke was rerun after rotating the Steam credential. Published workflow v13 succeeded for the connected Steam, Google Chat, Discord, and Telegram nodes; Google Drive remains unqualified because it is disconnected from the graph. Evidence is recorded in `.agent/reports/2026-10-28-live-provider-smoke.md`.
- `EMAIL-SMTP-1` — Dedicated SMTP Email action has encrypted `SMTP` credentials, TLS-only submission policy, mock/live contract, redaction and provider-failure classification. An owner-approved Gmail SMTP submission succeeded locally on 2026-10-31; inbox placement and production execution remain unverified. Attachments, Gmail OAuth, bulk sending and inbound email are out of scope. See `.agent/reports/2026-10-31-smtp-live.md`.

## Next approved slices

Initial connector work and later live qualifications are recorded in
`docs/35-connector-coverage-and-discovery.md`; use the latest follow-ups rather
than an earlier failure or pending status. The subsequent parallel expansion
audit at `04d67b6` is in `docs/37-node-expansion-audit.md`. Its proposed `NX-*`
checklist is not a set of completed features or new approved slice IDs.

These are the only currently approved follow-up directions. A task must target
one of these IDs or explicitly reopen a completed ledger slice.

| ID | Outcome | Status | Owner/evidence boundary |
|---|---|---|---|
| `DATA-NOTION-GITLAB-1` | Aggregate/Split Out, Sort/Limit, keyed Merge, typed Notion writes and GitLab.com | pending | Implementation complete; only PR/release tracking remains. Final verify passed: 1,131 API, 75 web, 224 E2E; one optional Riot test skipped. Check the associated develop→main PR for CI/merge/deploy. No real provider qualification claimed. See docs/47. |
| `APP-EXPANSION-1` | Deepen existing app operations and remaining qualification; initial seven-app implementation and app discovery already exist | pending | Do not rebuild initial nodes. See docs/35 for latest live evidence and docs/37 for operation/trigger/auth/UX gaps and priorities. Slack message/mention Trigger is implemented and covered in the November 9 batch; the owner deferred live qualification. Reddit access remains blocked; future live calls require owner-authorized resources. |
| `OPS-1` | Complete the VPS production qualification evidence: DNS/TLS, env shape, backup/isolated restore, rollback, and fixed-target smoke | operator-gated | Requires operator access and must not print secrets |
| `CONNECTOR-LIVE-2` | Remaining Google, GitHub and SMTP live qualification | pending | Drive upload/read, Sheets append/read/update, GitHub create issue/comment/label and one Gmail SMTP delivery to the intended inbox succeeded on owner-approved test resources. Local Google refresh is inferred from a credential update during a successful demo run; production refresh, GitHub PR merge and sustained delivery remain unverified. See the 2026-10-31 connector reports and 2026-11-01 recovery report. |
| `AI-GEMINI-1` | Qualify the existing Gemini connector across models and production | pending | Local live generation with Gemini 3.1 Flash Lite succeeded again on 2026-11-07; earlier 2.5 Flash and 3.8 Flash requests failed. Causes, other models and sustained or production behavior remain unverified. See `.agent/reports/2026-10-31-gemini-live.md`. |
| `AI-OPENAI-1` | Qualify the existing OpenAI connector with an authorized live test | pending | Implemented and verified locally; owner deferred real-provider testing. Migration applied only to local database. |
| `EDITOR-QUALIFICATION-1` | Audit credential status, picker, validation and mock/live node-debug UX | pending | PR #103 improved result-format controls and debug wording. November 9 adds mapping source selection and failed-node inspection, covered by E2E; reuse this work and inspect only remaining evidenced gaps. |
| `NOTION-1` | Qualify and selectively extend the existing Notion connector | pending | Search pages implemented in PR #56; live search qualified once locally. Typed database-page create/update and property discovery are implemented in DATA-NOTION-GITLAB-1 (docs/47); do not propose rebuilding them. Real typed-write and production qualification remain. |
| `POSTGRES-1` | Qualify and selectively extend the existing PostgreSQL connector | pending | Select rows implemented in PR #56; one local Supabase PostgreSQL LIVE workflow read succeeded with verified TLS and a one-row limit. Production qualification, sustained behavior and further operations remain. |
| `GMAIL-1` | Qualify existing Gmail operations and trigger; evaluate push separately | pending | Released in PR #57. Gmail Read and one targeted local trigger poll succeeded against a test email; sustained polling and restricted-scope approval remain. Pub/Sub push is not implemented. See `.agent/reports/2026-11-01-gmail-trigger-calendar-expansion.md`. |
| `CALENDAR-1` | Qualify existing Calendar actions and trigger | pending | Calendar polling trigger released in PR #110. PR #111 fixed the old-event baseline classification; one new-event local execution succeeded after that fix. One local updated-event execution and duplicate suppression passed on November 9 using controlled inline dispatch. Production polling and sustained behavior remain unqualified. |
| `EMAIL-UX-1` | Qualify existing Gmail and SMTP connection UX | pending | Released in PR #57; Gmail and SMTP keep separate providers and nodes. Further UX qualification remains separate. |

## Closed boundary

The following are not next implementation goals because they are already
implemented and verified in the repository ledger: authentication and identity
readiness, workspace/dashboard/workflow lifecycle, editor and node library,
credential lifecycle and dependency references, execution engine and worker qualification, node debug,
Go Live/activation guards, execution center, notification adapters, theme and
Relay-inspired design system, accessibility hardening, CI/CD, immutable image
deployment, release security contracts, production release candidate
documentation, dense-canvas navigation/minimap, and the reusable provider
resource-picker foundation.

## Recently closed slices

- `L13.1` reopen / auth and control polish (2026-10-29) — Owner-requested
  login/register visual follow-up is complete locally: dedicated `/register`
  sharing the login form, password visibility and pending/error feedback,
  16px inspector title, native-select chevron inset, and connection creation
  directly below its toolbar/above saved cards. Full gate: 213 API / 23 web /
  82 E2E. Evidence: `.agent/reports/2026-10-29-auth-control-polish.md`.
  Local develop delivery only; this is not deployed or a new OAuth integration.
  Subsequent owner-reported header alignment is also fixed in shared brand CSS:
  inline baseline space removed and Gilroy optically aligned. Full gate remains
  213 API / 23 web / 82 E2E; `.agent/reports/2026-10-29-header-brand-alignment.md`.

- `L13.1` reopen / product experience (2026-10-29) — New owner-requested
  refinement complete locally: workflow-first dashboard, searchable saved
  connections and guided draft-secret fields, shared dialog headers,
  deterministic menu dismissal, readable inspector/palette and theme parity.
  Full gate: 213 API / 23 web / 79 E2E. Task branch remains local and is
  integrated into develop; this UI refinement is not part of public PR #43.
  Evidence: `.agent/reports/2026-10-29-product-experience.md`. Do not propose
  these completed changes again without a concrete new finding.

- `PUBLIC-READY-1` (2026-10-29) — Public privacy/terms/support, contact redirect,
  footer/login links, metadata, robots/sitemap and social image shipped through
  PR #43 (develop → main), release `bff788782f6be8034629595abfc522f446eda6ac`.
  PR quality run 40889119558, main quality run 40890095004 and production deploy
  40891122177 passed. External public routes returned 200, contact returned
  308 → /support, and API/database/queue readiness returned ready. Website
  publication does not imply Google verification. Evidence:
  `.agent/reports/2026-10-29-public-site.md`.

- `UI-MOTION-1` / `L12.3` / `L13.1` (2026-10-29) — Owner-reported FAQ jump
  corrected with reversible shared GSAP disclosures, independent answers,
  hidden/inert resting state and persistent ribbon resources. Page-height
  changes now morph the existing field over 600ms while preserving Lenis,
  shader time and absolute scroll coordinates. Shared
  menu/dialog/inspector/progress, execution panels, hero tilt and product tabs
  now use the documented motion layer. Unused Motion package removed; dark
  Account menu first-frame contrast corrected. Full default verify passed:
  213 API, 23 web, 72 E2E (3.3m E2E). Evidence:
  `.agent/reports/2026-10-29-shared-gsap-motion.md`. This is local delivery;
  no remote push or deployment. Do not repeat this migration without a new
  concrete regression or owner request. Native-device performance and owner
  visual acceptance are distinct from passing Chromium tests.
- `L12.3` / `L6.1` readability and GSAP skills follow-up (2026-10-29) —
  Public type/footer readability and scoped GSAP section reveals are implemented.
  Eight official skills are pinned in user/project skill directories, with MIT
  notice, provenance and AGENTS selection rules in `docs/26-gsap-workflow.md`.
  Skill review removed redundant nested context. API 213, web 23 and all 66
  E2E are qualified across a full run and targeted recovery; two existing E2E
  synchronizations were corrected with their assertions retained. Fresh default
  full-suite CI is required before a future PR merges. Current evidence:
  `.agent/reports/2026-10-29-landing-readability-motion.md`. Do not reinstall
  these skills or repeat the typography/reveal migration without a new request
  or concrete regression. Owner visual acceptance remains separate.
- `L12.3` statement-to-diagram correction (2026-10-29) — The owner's new
  brief and initial-icon screenshot reopen only this missing choreography:
  dark outlined Fluxora badge → lime statement → collapsed badge → existing
  runtime diagram. The same object tracks measured geometry, clears desktop
  copy, reverses on scroll, and supports pause/reduced-motion/no-JS fallback.
  Full default verify passed: 213 API, 23 web, 62 E2E. Temporal recording uses
  the SVG fallback; existing WebGL lifecycle tests also passed. See
  `.agent/reports/2026-10-29-landing-card-handoff.md`. Local delivery only;
  no push/deploy or final owner visual acceptance is implied. Do not repeat
  the completed landing/ribbon work without a new specific requirement.
- `UI-CORE-1` / `L13.1` — Owner-requested visual unification across all six
  existing routes: compact glass landing navigation, shared BrandLockup and
  PageHeader, theme-aware product shell/overlays and common typography/control
  roles. Native visual review and full verify passed (213 API, 23 web, 58 E2E).
  See `docs/25-ui-core-unification.md` and `.agent/reports/2026-10-29-ui-core.md`.
  The owner subsequently authorized release through develop → main in PR #40.
  Its first CI exposed a disabled-button theme-transition contrast regression;
  the release follow-up is recorded in the same task/report. Production rollout
  requires passing replacement CI; owner visual approval is separate. Do not
  repeat this migration without a specific regression or changed requirement.
- `LANDING-1` — The public root is now a clean-room Fluxora landing with an
  explicit `/login` route for the existing email/password and OAuth UI.
  Session expiry and sign-out route to `/login`; source/template assets were
  not imported into this public repository. Focused browser coverage, desktop
  and mobile visual review, and the full quality gate passed.
- `LANDING-ANIMATION-1` — The public landing now has bounded Motion polish and
  two client-only React Three Fiber islands. Both unmount when off-screen or
  hidden, reduce-motion and no-WebGL paths stay semantic HTML/CSS, and no
  authenticated product surface imports the animation stack. Focused fallback
  Playwright, desktop/mobile visual review, and the full quality gate passed.
- `LANDING-V2-1` through `LANDING-V2-4` — Fluxora’s clean-room public landing
  now includes responsive navigation, hero/product proof, a readable workflow
  narrative, lifecycle, illustrative usage planning, FAQ disclosure, CTA, and
  footer. The initial delivery used bounded landing-only R3F islands. The owner
  subsequently reopened L12.3 with the supplied Relay MP4 and an explicit
  Catmull-Rom/GLSL/ScrollTrigger/Lenis brief; see the current revision below.
- `L12.3` visual revision (2026-10-29) — The landing now has an original local
  workflow replay, keyboard product tabs, a continuous Catmull-Rom ribbon with
  Perlin GLSL, shared GSAP/Lenis/R3F ticker, fold plate, reliability section,
  sample daily dashboard and workflow cases. It restores native scrolling on
  route exit, pause or reduced motion. This supersedes the older no-Lenis /
  hero-only boundary; do not reimplement the original landing slices. Current
  acceptance and verification live in
  `.agent/reports/2026-10-29-landing-art-direction.md`. Local changes do not imply
  a PR, deployment or qualification of real provider integrations.
- `L12.3` motion fidelity correction (2026-10-29) — Owner feedback rejected the
  thin-wire approximation. Temporal review separates the autonomous entrance
  from scrolling; a broad implicit ribbon field replaces the offset mesh,
  adds converging/diverging filaments, soft focus and drifting light, and
  preserves the existing cleanup/fallback boundary. Current evidence is
  `.agent/reports/2026-10-29-ribbon-motion-fidelity.md`. Visual acceptance by
  the owner remains distinct from functional test results; do not claim Relay
  equivalence from static frames or tests alone.
- `L12.3` detail/color refinement (2026-10-29) — The owner requested sharper
  lower sections and more particles in varied bright colors. The existing
  shader now retains 48 fine cores with separate glow and two multicolor
  particle fields. Native-GPU preview and full verify passed (213 API, 23 web,
  55 E2E). Latest evidence: `.agent/reports/2026-10-29-ribbon-detail.md`.
  Owner visual acceptance remains pending; no push or deployment is implied.

## Latest auth-header correction

- `L13.1` (2026-10-29): owner rejected the split-color header and inset showcase
  experiment. Auth body restored to `ddaa9e9`; only auth navigation styling and
  header controls differ. Full verify passed (213 API, 23 web, 82 E2E), and all
  12 route/theme/viewport screenshots were reviewed. See
  `.agent/reports/2026-10-29-auth-header-composition.md`.
  Owner follow-up after `8e25593`: the pale bar still blended into the light form;
  the auth header now uses the landing's dark marketing palette in both modes.
  Body layout and theme selection remain unchanged. Repeated full verify passed
  (213 API, 23 web, 82 E2E); rendered contrast and keyboard focus also passed.
  The final corrections shipped in PR #46; see the current release snapshot above.

## Non-negotiable loop

```text
read this state → select one non-closed ID → define proof
→ implement one vertical slice → run agent:task:check
→ run npm run verify → review diff and CI → merge only with owner approval
```

If no item can proceed without credentials, operator evidence, or a product
choice, report that blocker instead of inventing another feature or repeating a
completed slice.
