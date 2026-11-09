# Dashboard, Admin and Append Merge

## Outcome

- Status: partial — implementation and local review complete; full CI and release pending.
- One approved batch, implemented directly in the canonical checkout. No new
  dependencies, migrations, worktrees, provider scopes or live sends.
- Includes the earlier local Admin action-menu correction in `2de44e5`.

## Scope and evidence

| Area | Change and evidence |
|---|---|
| Dashboard | Shared SectionHeader, 20px heading/list separation, grouped actions, semantic status colors, six activity counts and a proportional 24h status bar. Real API counts; no invented trend or uptime claims. Execution center stays collapsed by default. |
| Admin | Read-only user→workspace→workflow→execution links; audit actor/date/target filters. Existing Admin guard remains. Queries return selected metadata, never workflow payloads or credentials. |
| Merge | Exactly two named inputs, Append order Input 1 then Input 2; 100-item/1MB limits; empty/skipped branches, handled/unhandled errors, cancellation and approval resume. No additional merge modes, loops or V1/V2 nodes. |
| Runtime tests | All ten new database-backed runner scenarios passed, including no provider replay after approval and rejection of redacted resumed input. |
| Provider readiness | Existing local Calendar created/updated/dedup evidence retained. Production currently has no Calendar connection/test workflow. Slack Trigger live testing remains explicitly deferred; no new Slack permissions or Events URL changes. |

## Validation

- Full `npm run verify` ran at the end of the implementation batch.
- API: 1,114 passed, one unrelated optional Riot integration skipped.
- Web: 75 passed. Workspace typechecks and application production builds passed.
- Tracked-secret scan and `git diff --check` passed.
- Full browser run: 221 passed; two new tests failed because of an exact-label
  locator and an incomplete mock identity response. Both corrected tests and the
  existing Admin menu scenario passed a focused rerun (3/3). The initial full
  command exited nonzero; clean full CI is mandatory before merge. The final
  Merge guidance also explicitly explains why single-node debug is unavailable.
- Initial local attempts stopped on a fixture database role mismatch and a Node
  23 test-process crash. The final attempt uses existing Node 22, matching CI,
  and the previously designated test database with synthetic records.
- Test ports 3400/3401 and `.next-e2e` leave the user's 3000/3001 preview available.
  Test Redis is temporary and stopped by the wrapper. Local scheduler stays off.

## Design references and limits

- [n8n Append Merge](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.merge/)
  supports ordered concatenation after connected inputs settle. Fluxora implements
  the approved two-input subset; this is not full n8n execution parity.
- [n8n execution views](https://docs.n8n.io/build/understand-workflows/understand-executions/view-all-executions.md)
  distinguish workflow/status/time filters. Fluxora reuses its existing execution
  views and adds scoped Admin metadata navigation rather than a second runner.
- Styling uses the existing landing-derived tokens, shared controls and menu;
  no new UI library or animation system.

## Release

Pending one `develop` → `main` PR, clean full CI, review/merge and
deployment result. This report does not claim production readiness for deferred
provider integrations.

Rolling back to a binary before Merge support cannot execute graphs using the
new Merge node; no database migration or existing workflow rewrite is involved.
