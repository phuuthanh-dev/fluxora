# Notion and Drive triggers, mapping and qualification

## Identity
- Task ID: `2026-11-11-notion-drive-mapping`
- Base: `f2a6a9cb004cc45c1138f615e5f2a8fa19df7a30`, branch `develop`.

## Target slice IDs
- `EDITOR-QUALIFICATION-1`
- `APP-EXPANSION-1`
- `NOTION-1`

## Owner-approved scope
1. Investigate the intermittent Discord/Telegram node selection failure; visually review the affected UI and inspect existing Steam and Jira production status. Real provider writes are restricted to already-authorized test resources and actions.
2. Implement a Notion data-source polling trigger for pages added/updated, with existing connections and resource picker.
3. Implement a Google Drive file/folder trigger for created/updated files, with existing Google connection and pickers.
4. Improve existing expression mapping based on actual editor UX; no duplicate engine or unrelated apps.

## Acceptance
- Accurate status, focused fix for demonstrated selection failure if justified; preserve live workflows and credentials.
- New triggers establish a baseline, use durable scheduling/checkpoints, bounded pagination and deduplication, preserve tenant isolation, and expose actionable connection/error state. Tests must exercise restart, retry, concurrency and pagination; no claims of exactly-once or live verification without evidence.
- Configuration is clear, keyboard accessible and visually checked in both themes using local test data.
- Compare with official n8n and provider documentation; document actual provider limitations.
- Complete all edits first, then final review and `npm run verify`, followed by one develop→main PR and merge when CI passes. Preserve the pre-existing next-env change.

## References
- [n8n Notion Trigger](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.notiontrigger/)
- [n8n Google Drive Trigger](https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.googledrivetrigger/)
- [Notion data-source query](https://developers.notion.com/reference/query-a-data-source)
- [Google Drive change feed](https://developers.google.com/workspace/drive/api/guides/manage-changes)
- [n8n mapping UI](https://docs.n8n.io/build/work-with-data/reference-data/use-the-ui-mapper/)

## Implemented behavior and limits to verify
- The Notion trigger watches pages in one shared data source, using its last-edited time and an overlapping checkpoint. The initial baseline does not run existing pages. It checks up to 1,000 pages per poll and stops with an actionable error instead of advancing an incomplete window. Notion exposes current page state, so intermediate edits between polls may be combined.
- The Drive trigger uses Drive's change cursor. It watches one existing file for updates, or direct children of one folder for creation or updates. Removal, recursive descendants, and dedicated shared-drive change feeds are outside this slice. A change feed can coalesce changes; it is not a guarantee of every intermediate edit.
- Both triggers persist a checkpoint and delivery receipt with the execution in one database transaction. A queue recovery pass retries dispatching queued runs. This does not imply exactly-once effects at external services.
- Receipt history is limited to 10,000 changes per trigger; reaching the limit stops polling for review rather than silently losing deduplication. Resetting starts a new baseline and can miss changes in the gap.
- The existing expression suggestion UI is placed in Configuration; no new expression engine or drag-and-drop mapping is claimed.
- Local verification: `npm run verify` passed on isolated PostgreSQL and Redis: 1,202 API tests passed, one optional Riot integration was skipped, 76 web tests passed, and 234 E2E tests passed. API integration exercises concurrent Drive polling, checkpoint expiry and recovery; Notion protocol tests cover pagination, replay keys and incomplete windows. The E2E selection test now uses exact node identities and fit-to-canvas; this improves test targeting but does not prove the original flaky run was an editor defect. Production UI inspection found the three Steam news checkpoints active; the daily v9 scheduled run was not yet observed. Jira update/delete and actual webhook renewal remain unqualified. Provider calls for the new triggers were mocked; do not claim live provider qualification. Visually inspected mapping and Drive configuration in light/dark and Notion configuration in dark. Existing landing GSAP empty-target warnings appeared without failing the suite. PR, CI and deployment evidence remain separate.
