# NX draft: review boundaries and release decision

Review snapshot: 2026-11-03, `origin/main` at `3c9ac35`, draft PR #75
head `188a26f`. This is an initial risk-based review, not a completed
line-by-line audit of every change. Recheck the base and head before using it
for a release decision. The Telegram/Kuma retention fix described below is a
subsequent local change and is not part of that already-passing CI run.

Verification update on 2026-11-03: the latest local draft passed a complete
`npm run verify` on isolated PostgreSQL/Redis and test ports, with 52 deployment
checks, 893 API tests, 60 web tests and 201 Playwright tests, plus typecheck
and build. All listed database integration flags were enabled; API/web tests
reported zero skipped. The source matched the tested snapshot except for the
generated `apps/web/next-env.d.ts`, which is excluded from the intended commit.
This local run used Node 23; GitHub CI uses Node 22 and has not yet run this
draft. The earlier pending-test statements below describe the findings when
they were recorded, not a newer result. The run used synthetic credentials and
data and does not prove live providers, first cutover or prior-release rollback.

## Scope and evidence

The PR compares 284 files: 21,235 additions and 2,409 deletions, including
tests, generated code graph and documentation. These numbers do not imply that
all additions are production features. `docs/11-code-graph.json` alone accounts
for 2,236 additions and 362 deletions. The execution directory includes 96
changed files, including tests. GitHub Quality gate passed for the PR head;
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
