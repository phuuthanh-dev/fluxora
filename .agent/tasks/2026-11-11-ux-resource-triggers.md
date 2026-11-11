# UI and connector follow-up

## Identity
- Task ID: `2026-11-11-ux-resource-triggers`
- Base commit: `ab60869895d1a7923a91db83a1169ec7a60ef5eb`
- Working branch: `develop`
- Implementer/reviewer: Codex, direct implementation and review.

## Outcome
Visually audit and improve the product interface, inspect existing Steam and Jira workflows, improve evidenced resource selection and evaluate Google Drive and Notion triggers against n8n.

## Target slice IDs
- `EDITOR-QUALIFICATION-1`
- `APP-EXPANSION-1`
- `NOTION-1`

## In scope
- Observe affected pages and interaction states directly in both themes; correct verified UI issues using the existing design system.
- Read existing Steam and Jira status; preserve live workflows and destinations.
- Address evidenced mapping and resource-selection gaps, then assess and implement provider trigger capabilities where supported.
- Audit and run verification once after the batch; create one develop-to-main PR and merge after checks.

## Explicitly out of scope
- Unrequested provider writes, secret exposure, data deletion, unrelated changes and duplicate nodes.

## Acceptance criteria
- [x] Targeted visual inspection and changes documented with actual screen evidence and theme coverage.
- [x] Existing workflow status and limitations accurately reported at the time of inspection.
- [x] Resource selection and trigger assessment based on existing source and n8n/provider documentation.
- [ ] Final review, appropriate verification, PR and merge completed.

Current progress: UI and shared picker changes are uncommitted. A browser check demonstrated expression insertion and restored the original local field value without saving. No product PR or deployment has been made for this task. Trigger work in this batch is assessment, matching the approved roadmap's discovery step; implementation remains a separate follow-up.

Final local gate (2026-11-11): `npm run verify` passed on isolated database `fluxora_ui_verify_20261111_test` and ports 3310/3311: 1,195 API passes with one optional skip, 76 web passes and 233 Playwright passes. Existing landing GSAP cleanup logged empty NodeList warnings; landing tests passed. This is not evidence of provider live qualification. The prior `next-env.d.ts` was restored after the isolated build and remains outside this change.

## Evidence and provider comparison — 2026-11-11
- Browser inspection: production Connections, Execution history and Admin Audit were observed in both themes; Dashboard in light mode; local Jira Update issue picker loaded 19 real issues. The connection form's OAuth link and helper text were too visually weak, and Saved views used a small native disclosure marker. Local changes were inspected in both themes for the connection form and disclosure; the editor was also inspected in light mode. This is targeted screen review, not proof that every page or viewport has been audited.
- Production Steam daily v9 and the three selected news workflows were shown live. History showed a v9 test run, a scheduled v8 success on 2026-11-10 at 17:16, and no observed v9 scheduled or new-news delivery. Jira issue-created production qualification succeeded earlier and the test workflow was inactive.
- Existing shared ResourcePicker already lists Jira issues and accepts expressions. Its manual expression field was missing the attribute used by the existing source-value insertion control. The shared field now supports insertion when expressions are allowed; direct local browser inspection confirmed a manual Jira issue field accepted a selected upstream expression. The original unsaved field value was restored. Broader picker and responsive UI inspection remains.
- [n8n Drive Trigger](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.googledrivetrigger/) polls when active. [Google Drive changes](https://developers.google.com/workspace/drive/api/guides/manage-changes) provides checkpoint and paginated change listing. Verify file/folder semantics, deleted or inaccessible files, pagination and durable dispatch before shipping a trigger.
- [n8n Notion Trigger](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.notiontrigger/) supports page added and page updated events in a database; its [implementation](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Notion/NotionTrigger.node.ts) polls a data source and accounts for timestamp ties. [Notion data source query](https://developers.notion.com/reference/query-a-data-source) supports filtering and pagination. Existing Fluxora data-source discovery can be reused; poll checkpoints, missed events and duplicate handling must be designed before implementation.
- Neither `trigger.google-drive` nor `trigger.notion` is in the current executable node catalog. Research is not a claim either trigger is implemented or live-qualified.

### Recommended next implementation, not a released feature
- **Notion first:** one trigger with a searchable data-source selector, event choices for page added/updated and a polling interval, reusing the existing Notion connection and data-source picker. Follow n8n's user-facing event model; establish a baseline on activation and use persisted checkpoints and deduplication when dispatching. Handle same-timestamp changes, pagination, permissions, retries and Notion's explicit incomplete-result signal before considering it reliable. Notion's [query documentation](https://developers.notion.com/reference/query-a-data-source) caps a query at 10,000 entries and documents filtering and partitioning.
- **Drive second:** one trigger with file/folder and event selection using the existing Google connection and resource pickers. n8n [regularly checks for matching events](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.googledrivetrigger/); Google [documents a paginated changes feed](https://developers.google.com/workspace/drive/api/guides/manage-changes), including an initial token and a new token to persist after the final page. File removal, access loss, moves and shared-drive behavior need explicit semantics. A notification from `changes.watch` is only a signal to read changes, not the change payload.
- Reuse the existing scheduler/credential/execution patterns where suitable; avoid adding a second framework. The two provider triggers have not been implemented or tested as part of this assessment. A production claim requires deterministic baseline, pagination, failure/recovery and duplicate-dispatch tests plus separate consented real-provider qualification.

## Safety boundaries
- Keep unrelated next-env.d.ts changes intact; local scheduler disabled.
- Use existing credentials only for authorized read-only inspection; never expose secrets.
