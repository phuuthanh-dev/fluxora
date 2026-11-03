# NX draft: review boundaries and release decision

Review snapshot: 2026-11-03, `origin/main` at `3c9ac35`, draft PR #75
head `20858a6`. This is an initial risk-based review, not a completed
line-by-line audit of every change. Recheck the base and head before using it
for a release decision. The later isolated handoff observations in this file
are local documentation and are not part of the PR head.

The runtime guard at `388ac7b` rejects unsupported versions before adapter
selection and credential access, but does not implement multiple versions of
one node type. Mixed OpenAI refusal handling changes plain-text execution
behavior; see [AI limits](39-nx06-ai-cost-controls.md).
The backup-script draft avoids overwriting an existing archive or publishing a
failed dump, but a successful dump is not a tested restore or proof of a safe
production rollback.
The later restore draft uses the shared release lock, blocks named active
API/worker containers and requests a single PostgreSQL transaction. It has not
passed an isolated restore drill; it cannot fence unmanaged
clients, recover writes after a snapshot, or by itself restore a previous release.
The later Trello Find Cards pagination draft uses an explicit opt-in for
historical nodes, bounded lookahead, and the documented page ceiling; it has
not been exercised against the actual provider.

Local preview observation on 2026-11-03: the previous API and contracts build
predated the later commits. With the user's consent to pause local scheduling,
the API was restarted from this checkout and contracts rebuilt. Both scheduler
and execution maintenance are disabled in that local process to prevent
automatic provider activity and history pruning. Health endpoints responded;
that alone does not prove end-to-end behavior. One cron workflow and six older
queued mock executions were observed before restart; records were not modified
by the restart procedure. This says nothing about production state.

Verification update on 2026-11-03: exact code snapshot `388ac7b` passed
`npm run verify` using isolated PostgreSQL/Redis and test ports: 54 deployment
checks, 909 API tests, 61 web tests, 202 Playwright tests, typecheck and build.
The database integration flags were enabled, with no skipped API/web tests.
The local run used Node 23; this documentation update was made afterward.
GitHub CI using Node 22 previously passed only PR head `20858a6` (run
`41625821559`); the updated head still needs CI. Synthetic tests do not prove
live providers, first cutover or prior-release rollback. Earlier pending-test
statements below describe the findings when they were recorded.

## Scope and evidence

The local comparison of PR head `20858a6` with `origin/main` changes 296 files:
22,123 additions and 2,483 deletions, including tests, generated code graph
and documentation. These numbers do not imply that all additions are production
features. `docs/11-code-graph.json` alone accounts for 2,259 additions and 356
deletions. GitHub Quality gate passed for the PR head;
that does not establish live-provider behavior or production cutover safety.

| Area | Observed change | Release boundary |
| --- | --- | --- |
| Connector operations | Adapter registry and added/expanded actions and fields across data, communication, development and AI connectors. | Review each adapter's input, authorization, redaction, retry and output against its existing v1 behavior. Mock coverage is not proof of provider qualification. |
| Node compatibility | Legacy node types remain, and several changed behaviors use separate `.v2` type strings. The optional `nodeVersion` currently accepts only `1`, including for a `.v2` type. | These are two distinct identifiers; do not claim a general per-node version migration framework exists. Old graph fixtures cover selected cases, not every saved workflow. |
| Execution and approvals | Queue job IDs and execution claiming change; running and continuation phases gain tokens. Recovery and approval transitions change. | Ship and review as one compatibility-sensitive runtime unit; mixed old/new workers are unsafe. Validate in-flight and queued cases, not only new executions. |
| Trigger state | Gmail checkpoint handling changes; RSS adds checkpoint/delivery tables; guarded webhook deliveries gain a digest. | Test recovery, duplicates, version ownership and provider-specific signature semantics independently. Do not infer external webhook registration from a receiver implementation. |
| Deployment | Compose bundle staging, release lock and drain/image guards change the deployment path. | PR's deploy path rejects the current legacy fleet. No proven first cutover or rollback to a prior release; a passing CI run does not clear this gate. |
| UI and starter workflows | Node configuration, picker and example workflows change. | Check accessibility, workspace/credential context and sample output against actual nodes; examples require users' own resources. |
| NX-07 | Item/batch, binary, database change capture and provider-gated social integrations have design notes. | Design is not implementation. See [NX-07 decisions](38-nx07-design-decisions.md). |

The database changes are four additive migrations: the nullable guarded webhook
digest, RSS checkpoint/delivery tables, approval continuation fields and a run
token. Additive SQL alone does not establish safe rollback: older code can
misinterpret new graph types or queue jobs, and external effects cannot be
undone by reverting a column.

## Findings and decisions

1. **P0 — First production cutover is not established.** An isolated
   mixed-version test showed that the legacy worker could claim an NX approval
   continuation and mark the execution successful while its successor was
   skipped. The new guard prevents this known path by rejecting the legacy
   fleet, but does not provide the missing cutover. A momentary empty execution
   count is not a drain. See the detailed evidence in
   [the NX audit](37-node-expansion-audit.md) and
   [deployment runbook](15-deployment.md).
   A subsequent isolated rehearsal tested whether separate Redis queue names
   alone would remove this risk. A stale initial job was left in the old queue;
   an approval continuation for the same synthetic execution was placed in a
   distinct new queue, with both workers sharing the migrated test database.
   The old worker consumed its own stale job and marked the run successful
   while the next node remained skipped; the new worker then ignored the
   continuation because the execution was already terminal. The old worker,
   execution-service and contract source files were compared with `origin/main`
   `3c9ac35`; the new worker came from the locally verified draft. This proves
   that queue-name isolation by itself is insufficient, not that an isolated
   queue plus a proven drain and reconciliation could not be part of a safe
   procedure. The experiment used synthetic records and no provider calls.
   In another isolated rehearsal, the actual legacy worker entry point ran an
   active mock job held at a PostgreSQL row lock. After one SIGTERM, a second
   legacy job remained waiting while the active job finished; the legacy
   process exited with code 0, and the actual new worker entry point consumed
   the waiting legacy job once. Both runs succeeded with one node attempt.
   This establishes that controlled worker handoff for that synthetic case,
   not API ingress fencing, provider-write outcomes, multi-worker topology,
   crash recovery or first production cutover. Node processes ran locally with
   disposable Docker PostgreSQL/Redis; no provider or production data was used.
   A further isolated rehearsal used one actual legacy worker process with
   `EXECUTION_WORKER_CONCURRENCY=2`, matching the observed production setting.
   Two mock jobs were held on separate execution rows, then SIGTERM was sent;
   a third job stayed queued while both active jobs finished and the legacy
   process exited cleanly. The new worker consumed that queued job once; all
   three mock executions succeeded with one node attempt each. This covers one
   process and one controlled handoff, not multiple worker processes, real
   provider effects, failure during shutdown, API drain, or rollback.
   A subsequent synthetic cron handoff used the legacy execution service to
   persist a scheduled run, then placed both a legacy-format queue job and an
   NX recovery job for that execution in the same isolated Redis queue. With
   the NX worker at concurrency two, both queue jobs completed but each of
   the two non-provider nodes ran only once. The legacy execution-service
   source matched `3c9ac35`; NX code came from the locally verified snapshot.
   This covers a single already-persisted cron execution and competing jobs,
   not interruption of the legacy API, missed schedules, provider effects or
   a complete first cutover.
   A read-only production inventory at 2026-11-03 12:00 UTC confirmed the
   legacy production image, four active workflows (one cron and three manual),
   no active webhook endpoints on those workflows, no pending approvals and
   no nonterminal executions. API and worker used the same default queue; its
   waiting, active and delayed counts were all zero. This is a momentary
   observation, not a maintenance fence or proof that accepted API work has
   drained. Workflow and queue state may change immediately after the query.
2. **P0 — Previous-release rollback is not established.** The draft guard only
   permits an automated restart of the exact currently running images once NX
   migrations are present. It must not be presented as rollback to the prior
   release. Saved graphs, in-flight queue jobs and provider effects need a
   compatible recovery strategy.
3. **P1 — Reviewability is poor.** Feature work, runtime behavior, schema and
   deployment changes are bundled together. Treat the table above as review
   units, not proof that they can be independently cherry-picked. Establish
   dependencies before proposing separate releases; splitting the PR without
   preserving runtime/migration compatibility may itself introduce risk.
4. **P1 — Versioning is partial.** `.v2` is a new node type; the separate
   `nodeVersion` property accepts only `1`. Registry exhaustiveness proves
   registration at compile time, not validation, safe mocks or redaction for
   every action. Do not mark NX-02 complete on that basis.
5. **P1 — Provider and scope qualification remains partial.** Automated tests
   primarily use synthetic data and transports. Existing provider credentials
   do not establish permission for new scopes or live write tests. The work
   does not provide full endpoint parity with n8n.
6. **P1 — Goal criteria remain open.** NX-02 through NX-07 are not all proven
   complete. Structured AI output is not an aggregate spend cap; design notes
   for binary and per-item execution do not implement those capabilities.
7. **P1 — Telegram deduplication could be lost under count-based retention.**
   Telegram and Kuma delivery identities were stored on executions, but the
   count limit protected only Vercel, Trello and Sentry identities. A busy
   installation could prune a recently completed Telegram execution and accept
   the same update as new. The local change gives Telegram and Kuma the same
   24-hour minimum local retention window; the count ceiling can therefore be
   exceeded temporarily. [Telegram documents](https://core.telegram.org/bots/api#getting-updates)
   that incoming updates are retained for at most 24 hours. The Kuma window is
   a Fluxora policy, not a provider guarantee. This does not promise exactly
   once or prevent replays after the window. A PostgreSQL-filter integration
   test and its CI opt-in have been added; final verification is pending.
8. **P1 — Passing CI did not run all existing database integration tests.**
   At `188a26f`, CI enabled the Gmail and rollback integration flags but did not
   enable the separate approval, RSS, Telegram, Kuma or Vercel flags. A prior
   isolated local verification enabled those tests; that does not make them
   part of the already-passing CI run. The local workflow now enables those
   five groups against its disposable PostgreSQL service. Their fixture
   cleanup is scoped to synthetic IDs, including Vercel's retention query;
   no real provider request or credential is required. The changed CI workflow
   has not run yet and must pass on the eventual PR head.
9. **P1 — Calendar pagination could retain a token from another query.** The
   editor did not clear a saved continuation when its connection, calendar,
   limit or start time changed, despite the operation metadata requiring that
   context to remain unchanged. The local change clears the token on those
   edits and adds an editor test, pending final verification. This only handles
   edits through this editor: expressions and direct API clients must still
   preserve the original context. Google requires the same query for subsequent
   pages ([pagination documentation](https://developers.google.com/workspace/calendar/api/guides/pagination)).
   The local datetime control now displays and accepts seconds and
   milliseconds rather than hiding them, and the field help calls out the
   exact timestamp. A browser test has been added; verification is pending.
10. **P1 — PostgreSQL editor could retain a table from another resource.**
    Changing the schema kept the old table, and changing the connection kept
    both schema and table. If the names existed in the new target, a read
    could silently select a different resource. The local editor clears the
    dependent choices, preserves separately configured row/column selection,
    and tells the user to review that selection. The added browser test is
    pending the final gate; API clients can still supply their own configuration.
11. **P1 — MongoDB insert could retain a collection after changing database.**
    The same editor dependency issue affects MongoDB reads and writes: a
    collection name from one database could be used under a different target.
    The local editor now clears collection on database changes and clears both
    database and collection on connection changes, while retaining the drafted
    filter or document. Its browser test is pending final verification.
12. **P1 — Google resource choices survived a connection change.** Drive's
    file and Sheets' spreadsheet could remain selected even when switching to
    another account, which might also have access to the previous file. The
    local editor now requires a new selection while retaining prepared Sheets
    range and values, and asks the user to review them. This does not change
    published graphs or direct API submissions. The browser test is pending.
13. **P1 — A planned node could follow real side effects.** The existing graph
    parser intentionally accepts historical and draft Instagram/Meta nodes, but
    publishing and live readiness did not reject them. The node itself failed
    only when reached, so an earlier live action could already have executed.
    The new draft keeps those graphs readable and editable, rejects publishing
    or activating an unavailable node, and reports the node in live readiness.
    A queued live execution or approval continuation created before the guard
    fails before invoking any node. This is deliberately conservative even for
    a node on an unselected branch; it changes behavior for old live graphs
    containing planned nodes, but does not delete or rewrite them. Mock runs
    retain their existing behavior. Forty-two focused API tests and the new
    mocked-browser readiness test passed in an isolated checkout; API/web
    typechecks passed. These do not replace the full final quality gate.
14. **P1 — Cron acceptance could race deactivation or republishing.** A scan
    read a published version, then the generic scheduled-execution method
    created a job without rechecking its workflow. The draft now locks the
    workflow row for Cron acceptance, checks the active published version, and
    deduplicates while holding that lock. Jobs already accepted remain queued
    and recoverable; this does not promise catch-up for missed cron windows or
    fence the old production process. A disposable PostgreSQL test exercised
    simultaneous duplicate acceptance and stale snapshots after deactivation
    and publication; the ten focused scheduler tests passed. Full verification
    and CI on the final commit remain outstanding.
15. **P1 — Legacy generic/GitHub webhook redelivery could resume an old
    continuation.** Its receiver dispatched duplicate execution IDs without
    `initialOnly`. The draft now dispatches only queued, never-started runs,
    using the initial-only job and recovery-safe queue operation. A focused
    synthetic test checks redelivery after an execution has started. Acceptance
    now locks the workflow and endpoint and checks the state used to verify the
    request. For a legacy GitHub signing secret in a credential, a shared row
    lock compares the encrypted credential snapshot used during verification;
    ciphertext is internal and never part of the execution or response. A
    disposable PostgreSQL test checks concurrent duplicates and state changes
    after the initial read, including endpoint and credential rotation; 68
    focused Cron, webhook and credential tests and API typecheck passed. These
    checks do not prove provider delivery, first cutover, exactly-once effects
    or safety of a process already running the old code. Full verify remains open.
16. **P1 — Legacy webhook deduplication and recovery were incomplete.** The
    retention count could remove a completed `webhook:` execution within hours,
    and accepted legacy deliveries had no recovery scan after a queue outage.
    The draft protects keyed legacy deliveries for a minimum local 24-hour
    window after completion and scans only queued, never-started deliveries
    with the initial-only fence. Requests without a provider/caller delivery ID
    get a random internal identity so a persisted run can be recovered; two
    separate requests without an ID cannot be deduplicated. Old unkeyed records
    cannot be found by this scanner. The window can temporarily exceed the
    configured count ceiling and is not a provider guarantee. The actual
    PostgreSQL selection/recovery fixtures and related webhook tests passed
    in a focused 38-test run; API typecheck passed. This does not include the
    complete app bootstrap, full quality gate, live provider or production.

An earlier baseline `verify` run passed API, web, typecheck and build but was
deliberately interrupted during Playwright after this additional defect was
found and the source changed (77 passed, one interrupted, 122 not run). It is
not a successful full verification of either snapshot. A subsequent full
verification of the local draft passed as recorded at the top of this file.

## Next review work

- Compare the actual runtime and migration changes against selected legacy
  fixtures and map dependencies before deciding whether a smaller safe release
  can be separated. Keep API and worker compatible as a single deployment unit.
- Review the existing connector changes rather than adding more providers;
  document concrete defects with tests or reproducible evidence.
- Develop and rehearse a first-cutover and recovery procedure using isolated
  data and no real provider writes. Do not remove the fail-closed guard or merge
  into an auto-deploy path until this gate is satisfied.
- Review the exact PR head and CI before any merge; rerun the quality gate if
  additional implementation changes follow the local verification above.

The release decision remains **NO-GO**. No production data or services are
changed by this review.
