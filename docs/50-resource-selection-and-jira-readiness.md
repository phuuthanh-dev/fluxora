# Resource selection and Jira readiness — 10 November 2026

## Approved batch
Reuse shared fields, ResourcePicker, authenticated discovery, vault and existing adapters. No new workflow engine, node version, UI library or database model is needed. Review source and provider behavior before running final verification.

## Provider and platform references
- [n8n resource locator / mapper](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/node-ui-elements/): list/search plus ID/URL modes as supported by the node; schema-driven field mapping.
- [n8n Jira source](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Jira/IssueDescription.ts): Issue Key remains a string for get/update. Fluxora's issue picker is a usability extension based on the provider API, not a claim of identical n8n Jira controls.
- [Atlassian issue search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/): enhanced JQL search with nextPageToken; recent writes may not immediately appear.
- [GitLab pipelines](https://docs.gitlab.com/api/pipelines/), [merge requests](https://docs.gitlab.com/api/merge_requests/), [GitHub labels](https://docs.github.com/en/rest/issues/labels).
- [Sentry organization issues](https://docs.sentry.io/api/events/list-an-organizations-issues/): project accepts IDs or slugs; keep the existing supported endpoint.
- [Atlassian privacy](https://developer.atlassian.com/cloud/jira/platform/user-privacy-developer-guide/) and [3LO distribution](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/) remain authoritative.

## Delivered controls (qualification is separate)
| Resource | Selection and stored value | Limits |
|---|---|---|
| Jira issue | Server search by literal key/text; key and summary label; stores issue key | 25 per discovery page, default last 90 days; escaped generated JQL; cursor; manual/expression fallback |
| GitLab pipeline / MR | Project-dependent picker | 50 per page; pipeline ID versus project-scoped MR IID; safe cursor and parent resets |
| GitHub labels | Repository-dependent single/multiple choices | 50 per page; create stores array, preserving commas in label names; old CSV accepted; 20 selected labels maximum |
| Sentry issue | Organization/project-dependent issue choice | 25 per page, existing cursor parser and provider adapter |
| Vercel deployment | Team/project-dependent choice | 25 per page, existing bounded list adapter; selection does not grant access |

All discovery runs on authenticated backend routes and checks workspace ownership before reading the provider credential. Responses contain minimal IDs/names with no-store. Changing a parent or credential clears dependent selected resources for the affected operations. Provider calls use fixed hosts and existing outbound policy. Non-Jira search filters the loaded pages and explicitly says so. Jira search is debounced and server-backed; stale requests cannot replace a newer scope. Failure, empty state, retry, pagination, manual key/ID and expression modes remain available.

The new Jira Search issues action accepts an optional explicit JQL query (default: updated in the last 90 days), a limit of 1–100 (25 default), and an optional previous cursor. It returns items (id/key/summary), hasMore and nextCursor, and uses the existing per-item execution contract. It does not fetch arbitrary issue bodies or users, and is not a trigger.

## Existing work that must not be repeated
Aggregate/Split Out, Sort/Limit, two-input keyed Merge, typed Notion properties, Slack Trigger, Google Calendar Trigger, Notion OAuth and Slack public distribution already exist. Existing resource pickers cover files/spreadsheets, calendars/events, databases/tables/collections, app models, Trello resources and Notion pages/data sources/properties. Generic ID fields are not all wrong: content, opaque runtime message IDs and expressions need text/mapping support. Do not automatically request new mailbox or channel-read permissions just to populate a selector.

## Jira readiness — evidence and remaining work
- PR118 merged/deployed b49ba01. Local Jira OAuth and project/type discovery passed; synthetic BTS-7 was created, read and updated through live execution; the test workflow is inactive. In this batch, live discovery loaded 17 issues; exact-key lookup and Get/Update/Add comment succeeded on BTS-7 in one controlled execution. The manual test workflow was then deactivated. This does not qualify independent users or every Jira operation.
- Production Jira env configuration is prepared from the existing local app credentials with production callback; deployment and a bounded production OAuth/read test subsequently succeeded on 10 November (docs/51). Never publish credential values.
- Owner offered a second Atlassian account. Independent Fluxora-user AND provider-user isolation still needs real qualification, including authorization to the test site. Two workspaces under one Fluxora user do not prove this.
- Jira app remains Not sharing; existing personal-data reporter remains disabled. Neither code presence nor a successful local API call establishes public-user readiness.

### Concrete privacy review before distribution
The current ledger tracks the authorizing account ID encrypted. The provider reporter handles cycle timing, rate limits and uncertain outcomes, but closed/updated responses become ACTION_REQUIRED. The later response batch provides an Admin review and bounded payload-erasure operation (docs/51); it does not infer arbitrary-person lineage. Arbitrary personal data in issue summaries, workflow configuration, propagated node/item payloads, logs, backups and external destinations has no reliable per-person attribution. Searching text for a name is not a safe substitute.

Owner's selected review policy: preserve execution status/timing, clear identified affected execution/node/item payloads. Before enablement, define the attribution boundary and retention, enumerate affected stored copies, coordinate with active executions/retries, review a dry-run list, authorize the actual update/erasure, and verify recovery/backup treatment. External destinations need their own handling and cannot be silently claimed erased. This is a concrete remaining implementation/review boundary, not authorization to delete data. Do not add an automatic broad payload purge or attest compliance to bypass the provider form.

Only after that review and a working response process should an operator enable reporting, qualify its responses, configure truthful privacy/distribution details and allow other users to install. Marketplace listing is a separate process. The owner saved sharing directly. A second independent Fluxora/Atlassian account then connected its own separate Jira Free site locally, read its own issue, and could not access the primary user workflow. Production OAuth and one bounded primary-site read are recorded in docs/51. These observations do not establish general privacy compliance.

## Next app evaluation (not implemented)
Microsoft Outlook/Teams would add Microsoft 365 coverage that current Gmail/Google Chat do not provide. Linear overlaps the Jira/GitLab issue use case and is a lower priority until existing resources/configuration are comfortable. No new app is part of this batch without a selected use case and provider authorization. Prefer depth and qualification over connector count.

## Final validation
Local final audit: harness/schema/graph/security checks, 1,165 API passes (1 optional skip), 76 web passes, typechecks and builds passed. The full browser run had 228 passes and 2 failures caused by the new fixture expecting PUT instead of the real PATCH save endpoint; after correcting the fixture, both light/dark scenarios passed (2/2). A final GitHub invalid-path guard was checked with all 6 discovery tests and API typecheck. Do not call the earlier full npm verify exit successful; a clean full CI gate is required before merge. Both theme screenshots were visually reviewed. Real Jira discovery returned BTS-7 by key. The provider rejected an unbounded default JQL with HTTP 400, so the default was corrected to updated >= -90d and the UI discloses that window. New provider selector reads beyond Jira remain unqualified until recorded.
