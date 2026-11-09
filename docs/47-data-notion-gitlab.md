# Data nodes, Notion properties and GitLab

Approved batch after PR #113. This extends existing item execution and connector
boundaries; it does not add a second engine, node versions or new dependencies.

## Data workflow

Example: Google Sheets Read → Sort (number, descending) → Limit (first 5) →
Aggregate (`report`) → a notification action. Split Out reverses a selected
array into individual items. Field controls suggest paths from the selected run;
you can enter a fixed nested path such as `customer.id` before a sample exists.
All these operations must be tested through the full workflow, because they act
on a complete list rather than an isolated item.

| Node | Behavior | n8n comparison |
| --- | --- | --- |
| Aggregate | All incoming items into one named array, including a reached empty list | [All Item Data mode](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.aggregate/) |
| Split Out | One selected array path; optional destination field; keep none/all other fields | [Split Out](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitout/) |
| Sort | Stable ascending/descending sort on one field, explicit text/number/date; missing last | [Sort](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.sort/) |
| Limit | First or last 0–100 items | [Limit](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.limit/) |
| Merge | Existing Append plus Matching fields, Keep matches or Enrich Input 1 | [Matching Fields](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.merge/) |

Merge has exactly two named ports. Matching uses strict scalar types (text `42`
does not match number `42`); missing/null keys do not match. It uses the first
matching Input 2 item and shallowly prefers Input 2 on field-name collisions.
The form explains those choices. n8n offers further output/multiple-match modes;
those are not claimed here. Existing 100-item/1 MB bounds and error branches apply.
Approval on a separate branch may pause the workflow; completed streams restore
without replaying providers. Approval directly inside an item list is unchanged
and remains unsupported.

## Notion database pages

Use the existing Notion connection and share the data source with that integration.
Choose **Create database page** or **Update database page**, then choose the source.
Add only the properties you intend to write. The editor loads names, types and
select/status options from Notion. Title/text, number, select, status, date and
checkbox have corresponding controls; expressions can map prior-step values.
Creating requires the title. Updating also requires a page belonging to the chosen
source; the runtime verifies that parent before the write. Changing source or
connection clears the old property selection.

Unselected properties are not sent. Clear value sends the provider's empty/null
value; clearing status can restore its default. Formula, relation, rollup and
other unsupported types stay read-only in this UI. A changed schema fails before
writing and asks you to reload. An uncertain write must be checked in Notion
before retrying; Fluxora does not silently repeat it.

This follows [n8n's Database Page resource](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.notion/)
and [Notion page-property writes](https://developers.notion.com/reference/page-property-values),
using API version 2025-09-03 and data-source parents.

## GitLab.com

Create a GitLab connection with your own personal access token: `read_api` for
reads, `api` for issue/comment writes. Project dropdowns show membership projects
with pagination; exact numeric IDs remain available. Issue numbers are relative
to the selected project. Changing project clears the issue selection.

Actions: Get project, List issues, Get issue, Create issue, Add issue comment.
The list returns `nextPage`; pass it with the same project/state/page size.
Provider mutation results can be uncertain after network/server failures and
are not automatically repeated. No token is included in workflow output.

Triggers: pipeline events and merge-request opened/updated/merged/closed/reopened.
Publish the workflow, then Configure webhook. In GitLab project **Settings →
Webhooks**, use Fluxora's public HTTPS URL, choose the matching event, generate a
**signing token**, and paste it into Fluxora's registration. Keep SSL verification
enabled, save the endpoint and activate the workflow. The token is stored
encrypted and not returned; it is separate from the API credential. Each workflow
registration serves its selected project/event. Fluxora does not automatically
create the remote GitLab webhook in this batch.

GitLab now recommends signing tokens for new webhooks. Fluxora verifies the HMAC
of `webhook-id.webhook-timestamp.body`, accepts only timestamps within five
minutes, and uses the stable `webhook-id` for deduplication through the existing
durable execution mechanism. CI variables and raw event payloads are not copied
into the normalized trigger output. The server clock must be synchronized.

References: [GitLab webhook configuration and signing](https://docs.gitlab.com/user/project/integrations/webhooks/),
[event payloads](https://docs.gitlab.com/user/project/integrations/webhook_events/),
[issues API](https://docs.gitlab.com/api/issues/), [notes API](https://docs.gitlab.com/api/notes/),
[n8n GitLab node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gitlab/).

## Release boundary

One additive migration adds the GITLAB credential provider. Existing credentials,
workflow versions and data are preserved. New nodes require this application
version; older binaries cannot execute them. New GitLab and Notion write tests in
this batch use synthetic responses, not real accounts. This document describes
implemented behavior; the current verification/release result is recorded in
`docs/19-agent-state.md` and the batch report.
