# Task contract

## Identity
- Task ID: `2026-11-09-data-notion-gitlab`
- Base commit: `912ad05172ba29199ddbfe5d0bc9b69c89520487`
- Working branch: `codex/data-notion-gitlab`; only develop is pushed.
- Implementer/reviewer: Codex direct implementation, diff audit and final CI.

## Outcome
One owner-approved batch: whole-list data nodes, matching-key Merge, typed Notion database page writes, then GitLab actions and triggers. This contract records the approved scope during final audit; it is not evidence of an earlier gate.

## Target slice IDs
- `DATA-NOTION-GITLAB-1`
- `NOTION-1`
- `APP-EXPANSION-1`

## In scope
- Aggregate all items, Split Out one array, typed single-field Sort, first/last Limit; existing two-input Merge gains matching fields.
- Notion create/update data-source pages with supported typed properties and schema-driven controls.
- GitLab.com project/issue reads, issue/comment writes, signed pipeline/merge-request events; scoped resource pickers and encrypted credentials.
- Preserve existing engine, bounds, error/resume semantics and landing-derived controls. One final audit/verify, develop→main PR and authorized merge/deployment.

## Explicitly out of scope
- New execution architecture, v1/v2 nodes, arbitrary code/SQL, self-hosted GitLab, all n8n Merge modes, automatic GitLab webhook creation.
- Real provider mutations or new OAuth permissions; Slack/Calendar live deferrals remain.
- Deletion of existing data, credentials, unknown resources or rollback images.

## Acceptance criteria
- [x] Whole-list transforms and keyed Merge preserve bounded data and safe approval resume.
- [x] Notion resolves schema before selected writes; project/source changes clear stale selections in the editor.
- [x] GitLab tokens remain encrypted; writes fail safely when outcome is uncertain; signed events validate/filter/deduplicate before dispatch.
- [x] Full local gate and UI review recorded in the final report.
- CI, merge and deployment evidence: associated develop→main PR and its main/deploy runs.

## Required evidence
- Synthetic provider unit tests, actual disposable-DB engine tests, browser configuration and theme coverage.
- Final npm run verify and source/diff/secret review; no provider live qualification claimed.

## Safety boundaries
- Keep local web/API on with scheduler disabled. Use existing disposable test database and temporary Redis for verification.
- The owner explicitly authorized one PR and merge after validation. No secrets in fixtures, output or Git.
