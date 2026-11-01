# Google reconnect recovery and scope clarity

## Outcome

- Status: `complete` for the local UX and synthetic tests; production release
  and Google approval remain separate.
- Missing refresh tokens leave credentials untouched and return users to the
  matching workspace with an explanation and retry action. Existing broad Drive
  and Sheets access is disclosed before connection.

## Commit and scope

- Base commit: `2514147f9d58081708190bf789265bdd796673b8`.
- Branch: local `codex/google-oauth-recovery-ux`, intended for local develop.
- Scope respected: `yes`; OAuth scopes and other callback failure handling did
  not change. The older uncommitted OAuth worktree was not modified.

## Acceptance criteria

| Criterion | Evidence | Status |
|---|---|---|
| Missing refresh token preserves the prior credential and redirects to the matching workspace | synthetic callback regression | pass |
| Tampered state and different session user are rejected; redirect contains no tokens or authorization code | synthetic callback regression | pass |
| Broad scope is disclosed separately from sign-in | connection form and mocked browser test | pass |
| Recovery works across light/dark, desktop/mobile | five focused Playwright checks and reviewed screenshots | pass |
| Real Google Sheets read | owner-authorized demo workspace and synthetic spreadsheet, live published workflow | pass once; not a general production qualification |

## Validation receipts

| Command or check | Result | Relevant evidence |
|---|---|---|
| `npm run agent:task:check -- .agent/tasks/2026-11-01-google-reconnect-ux.md` | pass | `EDITOR-QUALIFICATION-1` |
| `npm run verify` | pass with temporary isolated port adaptation | API 240, web 25, Chromium E2E 127; isolated PostgreSQL, ports 13300/13301 |
| Google demo Sheets read | pass | `Demo: Read rows from Sheets`, live execution succeeded |
| Refresh metadata | inference only | managed credential `updatedAt` fell within the successful run; code path and absence of an audit update support refresh, without revealing tokens |
| SMTP inbox placement | pass once | the owner-approved test message appeared in the intended Gmail inbox on 2026-11-01; no new email was sent |
| Production backup | partial | deploy run `41229373344` logged an on-VPS backup; recent off-host copy and restore not established |

Test-only URL/port substitutions were reverted after the full run. Existing
localhost servers and their databases were not used for automated tests. The
owner-approved separate demo workspace was used only for a real Sheets read.

## Files changed

- Google OAuth callback and its synthetic regression test.
- Connections dashboard, form and shared CSS.
- Browser regression test, product/architecture/state documents and task/report.

## Risks and follow-up

- Other callback errors still follow existing error handling. Successful OAuth
  redirects remain unchanged. The UX does not repair a credential previously
  stored without a refresh token.
- Google Data Access remains under review; no approval or CASA completion is
  implied. The live refresh evidence is inferred and production refresh is not
  qualified. No provider token or response payload was inspected.
- The isolated test database was removed after verification, consistent with
  the owner's cleanup preference; no existing database was removed.
