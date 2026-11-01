# RSS CDATA regression and release audit — 2026-11-01

PR #58 merged at `955c00c`; the GitHub quality gate and production deploy
completed successfully. Public web root, API liveness and readiness returned
HTTP 200 in read-only checks. Deploy logs recorded a server-local backup and a
migration container completing; no restore or workflow/credential audit was made.

A direct local live invocation of the shipped RSS executor against GitHub's
public changelog feed returned `INVALID_RESPONSE`: its HTML doctype occurs
inside CDATA, rather than being an XML DTD. A Node.js public feed succeeded.
A local fix distinguishes comments, CDATA and processing instructions from
actual declarations. Regression tests cover literal HTML declarations, genuine
DTD/entity and a processing-instruction bypass attempt. With the local fix,
both public feeds returned three entries with links. This was a direct executor
check; it was not an end-to-end workflow or production check. No credentials
or provider writes were used.

Focused RSS and outbound policy tests: 14 passed. API typecheck passed.
Full `npm run verify` passed using isolated PostgreSQL and Redis: 342 API
tests passed, one opt-in Gmail integration test skipped, 31 web unit tests
passed, and 143 Playwright tests passed. The fix has not been pushed, merged
or deployed.
