# Reddit OAuth client-secret hint exclusion

## Outcome

- Status: complete locally; production release pending.
- Removed Reddit OAuth app client-secret hints from saved connection summaries. Existing eligible non-OAuth opaque-token hints are unchanged.

## Commit and scope

- Base commit: `d852bf2e108ceae4010dcfce8122018d1cc96d77`.
- Implementation: see commit containing this report; no provider calls, saved credential changes, migration, or deployment.

## Acceptance criteria

| Criterion | Evidence | Status |
|---|---|---|
| Reddit client secret never contributes a saved connection hint | `credential-hints.test.ts` and `credential.service.test.ts` using synthetic data | Passed |
| Approved Trello token hints remain unchanged | Existing credential-hints test | Passed |

## Validation receipts

- Task contract passed `npm run agent:task:check`.
- Isolated `npm run verify` passed: 353 API tests passed and 1 skipped, 32 web tests passed, 145 Playwright tests passed. Synthetic local PostgreSQL and Redis were used; no provider calls were made by the suite.

## Files changed

- Credential hint allowlist and focused tests; connector/state documentation; task and report.

## Risks and follow-up

- Existing production summaries can expose the final two characters of qualifying Reddit app client secrets to the authenticated workspace owner until this local correction is released. Existing endpoints set `Cache-Control: no-store`; this finding does not establish exposure of full secrets or access by unauthorized users.
- No claim of real Reddit access or Google/OAuth review approval is implied.
