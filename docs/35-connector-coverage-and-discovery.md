# Connector coverage and scalable discovery — 2026-11-01

## Comparison and design decision

Zapier's editor asks for app, event and account, then configuration and test; n8n documents operations by app and resource. Fluxora keeps the existing App → Operation model, with app categories that can be collapsed, operations grouped as triggers/actions/search/utilities, search, recent/favorites, and explicit unavailable states. Existing graph node IDs are unchanged. The grouping is presentation metadata, not a new workflow type or promise of a complete provider API.

Sources: [Zapier action setup](https://help.zapier.com/hc/en-us/articles/8496257774221-Set-up-your-Zap-action), [Zapier editor](https://help.zapier.com/hc/en-us/articles/16722578092429-Use-the-editor-to-build-and-view-your-Zap-workflows), [n8n Trello operations](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.trello/), [n8n Gmail message operations](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gmail/message-operations/).

## Coverage inventory

This inventory describes catalog operations, not complete vendor APIs. A node may expose multiple modes inside one operation. Live evidence below is limited to the specific named operation and one-time test described, not a reliability or security certification. “Future” items are candidates, not implemented commitments.

| App | Available catalog operation(s) | Known evidence / remaining scope |
| --- | --- | --- |
| Steam | Account snapshot | Live in owner's workflow; other API domains and sustained monitoring not established. |
| Google Chat | Webhook message; OAuth message | Webhook live in owner flow; OAuth subject to app/account restrictions. |
| Discord | Webhook message | Live in owner flow; bot management and triggers not implemented. |
| Telegram | Send message | Live in owner flow; receive/update triggers and broader bot operations not implemented. |
| Google Drive | Manage files | Search/read/upload/download modes; one local test on designated data; Google broad-scope verification remains open. |
| Google Sheets | Read or write rows | Append/read/update tested once on designated data; broader spreadsheet operations remain open. |
| Google Calendar | List, create, get, update, delete, availability | Single local create/get/update/delete test; list/availability and sustained production proof outstanding; no trigger. |
| HTTP | API request | Generic request with credential options; not a claim that arbitrary provider-specific auth can be reused. |
| Email | SMTP send | One local Gmail SMTP test; attachments, inbound mail, production delivery not established. |
| Gmail | New message trigger; read messages | One local targeted polling/read test; no push trigger, sustained polling or Gmail send action. |
| OpenAI | Generate text | Implemented with mock coverage; user deferred live API test. |
| Gemini | Generate text | One local live model succeeded; other model errors and sustained production behavior unqualified. |
| MongoDB | Find documents; insert document | Local read and approved insert tested; update/delete and transactional operations absent. |
| Notion | Search pages | One local search tested; page and database mutation absent. |
| Trello | Create card | Production board discovery failed twice; root cause not established; write not tested. n8n also supports cards, lists, labels, checklists and other resources. |
| Sentry | List issues | Production read succeeded for test project; alerts/webhooks, pagination and other operations absent. |
| Vercel | List deployments | Production read succeeded for `my-portfolio`. After `2eebdbc`, team discovery returned the 403-specific fallback, the UI offered Personal account, and the test project was listed. Deploy mutations/triggers absent. |
| Supabase | Select rows | Production read succeeded with publishable key and test RLS policy. After `2eebdbc`, live discovery still returned a generic unavailable error; the exact provider failure is unconfirmed. A local follow-up switches to manual input for that failure as well, pending verification and release. No mutations or arbitrary SQL. |
| Uptime Kuma | Monitor alert trigger | Mock checks only; user has no instance. Header secret is not replay protection. |
| Reddit | List public posts | Mock checks only; access and live proof remain pending. Reddit announced new public Data API access requests would close on 2026-10-31 and migration of existing access to its Developer Platform. |
| RSS | Read feed | After deployment `2eebdbc`, a manual production live workflow read the GitHub Changelog feed successfully on 2026-11-02; the node and overall execution succeeded. This verifies one public feed, not all RSS/Atom variants or sustained reliability. No RSS trigger. |
| PostgreSQL | Select rows | Implemented; live database qualification pending. No write operation. |
| GitHub | Issue opened, PR opened, push, workflow run completed, create issue, add label, add comment, merge PR | Several scoped operations tested; merge operation and sustained production behavior still need explicit proof. |
| Facebook Meta | Manage content | Planned only, cannot run. |
| Instagram | Manage content | Planned only, cannot run. |

## Qualification checklist for each new operation

- [ ] Define resource, operation, auth scopes and supported provider/account types; compare official provider docs and the applicable n8n operation, without claiming equivalent coverage.
- [ ] Use stable identifiers and discoverable resource pickers when supported; provide accessible manual/expression fallback and actionable, redacted errors.
- [ ] Define input/output, data exposure, size limits, timeouts, retry/uncertain-write behavior and trigger delivery semantics.
- [ ] Add mock, failure-path and owner-authorization tests; test live only on explicitly designated resources and record exact evidence.
- [ ] Document unsupported operations and provider restrictions; do not mark an entire app complete because one operation passed.

## Supabase and credential UX limits

[Supabase removed schema/OpenAPI discovery for anon keys](https://supabase.com/changelog/42949-breaking-change-removing-access-to-openapi-spec-via-the-anon-key); normal table reads still follow RLS. Do not require a secret/service-role key solely to populate a dropdown. The UI should clearly transition to a manual table name when schema discovery returns the documented denial.

At owner request, an authenticated workspace owner may see a fixed mask and at most the final two characters of eligible long opaque API keys/tokens. This leaks a small fragment and is an identification hint, not proof that a token is correct. Passwords, OAuth credentials, connection strings, webhook URLs, short or non-opaque values have no hint. Full secrets stay encrypted and never return; responses carrying hints are non-cacheable.

## Candidate functional scope for the seven new apps

These are explicitly **not all implemented**. They are the proposed common-workflow scope for completing each integration, not a commitment to mirror every provider endpoint. Prioritize read paths and safe event triggers before writes. Every new operation needs the qualification checklist above.

| App | Minimum useful scope to evaluate | Important design constraint |
| --- | --- | --- |
| RSS | Read feed; new-item trigger with item deduplication and polling interval; feed metadata and error handling | Durable cursor, first-run policy, canonical item identity, conditional requests and safe bounded XML. |
| Trello | Find/get boards, lists and cards; create/update/move/archive cards; card/list/board event trigger | Resource selectors, explicit write scope, webhook authenticity/lifecycle, and uncertain create outcomes. |
| Sentry | Find/get issues, filter status and project; issue or alert trigger | Regional endpoints, narrow token scope, sensitive issue payloads and verified webhook source. |
| Vercel | List/get project deployments and statuses; deployment event trigger | Scoped tokens and teams; verify webhook signing and project ownership. Creation, promotion, rollback and environment changes are separate higher-impact actions. |
| Supabase | Select with typed filters/columns and pagination; insert/update/delete by bounded condition; row-change trigger where supported | Preserve RLS, use publishable or appropriately scoped credentials, no unbounded writes, and explicitly define change delivery. |
| Reddit | Read/list/search posts and comments; new-post monitoring only when permitted | Approval, current terms, rate limits, retention/deletion duties; do not assume posting or private-scope access. |
| Uptime Kuma | Receive and normalize monitor up/down alerts; test notifications; distinguish monitor state | Protect webhook secret and prevent duplicate notifications; replay/delivery limits must be disclosed. Management actions require a documented supported API, not an assumed internal API. |

As of the [Reddit October 2026 announcement](https://support.reddithelp.com/hc/en-us/articles/54353370049684-Changelog-October-8-2026), new public Data API access requests close on October 31, 2026; removal for unregistered apps begins January 12, 2027 and remaining public API access ends in March 2027. Reddit also announced RSS support ends November 13, 2026. Existing access and Developer Platform migration must be checked for the specific application; generic RSS is not a durable Reddit workaround.

## External review and operational limits

On 2026-11-01, Google Cloud Verification Center reported that the submission had been received. Homepage and branding steps were marked complete; privacy, application functionality, data access, minimum scopes and additional requirements were still under review. This is not an approval. The console noted review may take 4–6 weeks.

The deploy for merge `8263d9f` completed successfully and the web/API returned HTTP 200 in a basic read-only check. This does not establish sustained reliability, backups, restore correctness, or authorization correctness. A later read-only SSH attempt using the available key was denied; no operator-side restore/rollback validation was performed. An isolated restore drill remains open. The owner previously deferred backup work, so it must not be silently represented as complete.

Follow-up 2026-11-02: PR [#60](https://github.com/phuuthanh-dev/fluxora/pull/60) was merged as `2eebdbc` and [production deployment](https://github.com/phuuthanh-dev/fluxora/actions/runs/41330673844) succeeded. A separate workflow, `Fluxora connector verification - RSS`, ran its manual trigger and RSS read against `https://github.blog/changelog/feed/` in live mode: overall `SUCCEEDED`, RSS node `SUCCEEDED`, and items were returned. The test workflow was deactivated afterwards with execution history retained. In the existing Vercel verification workflow, the account picker displayed the new team-discovery-denied fallback and the Personal account's `my-portfolio` project. The fallback is reached only on provider HTTP 403; this demonstrates the fallback and project picker, not permission to enumerate teams or other accounts. Production web/API and local web/API each returned HTTP 200. These are point-in-time smoke tests, not proof of production reliability.
