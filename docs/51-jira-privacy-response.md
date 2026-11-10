# Jira production OAuth and privacy responses

Owner-approved batch: 10 November 2026. Task:
`.agent/tasks/2026-11-10-jira-privacy-response.md`.

## Platform references and deliberate scope

- [Atlassian user privacy guide](https://developer.atlassian.com/cloud/jira/platform/user-privacy-developer-guide/): report account IDs and the oldest stored-data observation, respect the reporting cycle, and act on closed/updated responses. Updated data may be erased rather than refreshed. The reporting API recommends the app owner's bearer token. Its documented active/closed test accounts are appropriate for protocol testing; do not repeatedly report real closed accounts.
- [Atlassian 3LO](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/): a user's grant is constrained by their selected site and permissions. Production callbacks, provider distribution and actual consent are independent of a successful mock test.
- [n8n execution data management](https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/manage-execution-data.md): reduce retained data and prune finished executions; running/waiting work is excluded. Fluxora already has retention. This batch does not add another pruning scheduler or claim n8n implements this Jira-specific response screen.
- [n8n Jira credentials](https://docs.n8n.io/integrations/builtin/credentials/jira/): the documented OAuth setup uses an Atlassian app created by the person configuring n8n, alongside API-token authentication. [Make](https://apps.make.com/jira) documents an API-token connection; [Zapier](https://help.zapier.com/hc/en-us/articles/38815673973133-How-to-get-started-with-Jira-Software-Cloud-on-Zapier) documents its common Apps/connection flow. Their public connection instructions do not establish their internal reporting implementation or an exemption from privacy obligations.

Atlassian requires reporting when an app stores personal data; it recommends
retrieving current data without storing it to avoid that reporting process. It
does not prescribe a dedicated Admin screen. Fluxora retains execution payloads,
so the reporting/storage assessment cannot be skipped merely because it is an
automation tool. Managed OAuth remains unchanged: each user connects their own
authorized site. The owner chose to consolidate operator review into Support,
rather than add a Jira-specific administration area or generic privacy framework.

## Response process

`/admin/support` reuses its existing Privacy and data requests card. Its review
section loads only when opened, uses the existing platform-administrator boundary,
same-origin mutation guard and shared landing-derived controls/themes. Only
`ACTION_REQUIRED` and `UNCERTAIN` records are listed; normal reporting remains
background work. Connection inventory is a secondary disclosure. There is no
separate Privacy menu or `/admin/privacy` route. Metadata, not raw Atlassian
account IDs, credentials or execution payloads, appears in the review section.

OAuth saves durable credential/workspace IDs in the existing encrypted-account
ledger. Those links survive credential deletion. **Inventory current connections**
explicitly links existing credentials and preserves their oldest known date; it
does not recover identities from deleted credentials or declare a legacy inventory
complete. Missing attribution blocks resolution; unknown data must be retained
and investigated rather than guessed.

A confirmed `closed` or `updated` response pauses provider access for the account.
The operator reviews a preview containing related workflows and counts of their
execution/node/item records, including other versions and downstream nodes.
The snapshot is signed, administrator-bound and expires after 15 minutes. An
active workflow, queued/running/waiting execution or provider registration blocks
erasure. Changed data requires another preview.

Confirmation requires a review reference, explicit acknowledgement of copies
outside the preview, a separate legacy acknowledgement where applicable, and
typing `ERASE`. A serializable transaction rechecks the snapshot and locks affected
records. It clears trigger/node/item payloads and error text, removes matching Jira
connections and the resolved account ledger, and preserves execution status,
timing and immutable graphs. A `privacyErasedAt` marker prevents retry from treating
missing input as valid data. A new connection after an updated-account erasure
retrieves current identity data through normal OAuth. No workflow is automatically
republished or silently pointed at a replacement connection.

Unknown/interrupted reports stay `UNCERTAIN` without pausing unrelated Jira
operations; only a confirmed closed/updated action pauses account access. An operator can record a confirmed
later eligible reporting date and a reference after investigating the provider.
Recovery does not send a report and refuses to replay before the last known cycle.
If the last response was lost, verify the actual provider cycle before recovery;
the default is not proof that the provider did not specify a longer interval.

## Retention and operator obligations

Existing defaults retain successful executions for 14 days, failures for 30 days
and at most 10,000 runs; this response process can erase eligible payloads sooner.
API/SSE events contain execution IDs and event kinds, not payload copies. Logs
must not include raw provider objects. The response audit stores counts/reason
and an operator reference without the subject ID/hash or erased content.

The preview does **not** infer every person in arbitrary issue text, mutate
immutable configurations, erase backups/log exports, clear an already-open browser,
or remove data sent to other providers. The operator must identify additional
subjects and handle these copies before acknowledging the review. Restore of an
older backup must reapply erasure decisions before serving data. Store the review
reference in the external operator process so the response can be traced without
retaining a subject identifier in the application audit. These are real operational
obligations, not automatically completed by a checkbox or a passing test.

## Activation and qualification

Keep `JIRA_PRIVACY_REPORTING_ENABLED=false` until the owner has reviewed actual
attribution, response handling and external/backup coverage. Configure the existing
owner connection through `JIRA_REPORTING_WORKSPACE_ID` and
`JIRA_REPORTING_CREDENTIAL_ID`; the scheduler must also be enabled. Do not use an
arbitrary user's token to stand in for the app owner. Provider sharing was saved
directly by the owner during PR #119 qualification; that setting alone does not
establish compliance.

Before release, run the batch audit and full verification, review both themes,
and record actual production OAuth/read and reporting protocol outcomes in the
release report. No real erasure or reporting activation has occurred merely
because this source file or the Admin controls exist.

## Production read evidence — 10 November 2026

OAuth completed in the primary account's production test workspace. A new Manual
→ Jira Search issues workflow queried only synthetic `BTS-7`, limit one. The live
Jira node succeeded in 1,214 ms and returned that issue; the workflow was then
made inactive. No Jira write or real privacy erasure was performed. This qualifies
production OAuth plus one bounded read, not all operations or reporting responses.
The preceding independent-account/site local test remains separate evidence.

## Live reporting protocol qualification — 10 November 2026

A one-shot local backend call used the existing app-owner OAuth connection and
only Atlassian's two published vendor test accounts. The active test returned
HTTP 204 / no action; the closed test returned HTTP 200 / closed. Both used the
default seven-day cycle. No user account ID was reported, no scheduler was enabled
and no production data was erased. The updated response is covered by synthetic
protocol and real-PostgreSQL response tests because Atlassian provides no fixed
updated test account. This is protocol evidence, not a claim that automatic
production reporting or all external-copy obligations are complete.

## Local final validation / release gate

Harness, schema, secret scan, typechecks and builds passed. API:1,175 passed,
one optional Riot integration skipped; web:76 passed. The full browser suite had
228/231 passes. The corrected node-selection fixture, privacy review/contrast and
public pages passed their focused rerun (8/9 total); the remaining failure is an
unchanged ribbon GPU smoothness bound on this Mac (0.476 vs0.45). Do not describe
that root verify run as successful or lower the bound. The release PR must pass
its complete npm verify on the exact final head before merge. Both privacy-theme
screenshots were visually inspected after correcting modal skin and field styles.
