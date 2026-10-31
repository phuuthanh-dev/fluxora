# Google OAuth refresh safety — 2026-11-01

## Outcome

- Status: `complete` for the local defensive code and synthetic verification;
  real-provider refresh and production rollout remain unverified.
- The callback rejects token exchanges without a usable access token, refresh
  token or expiry before writing any Google connection.

## Commit and scope

- Base commit: `e429d8b1b5552b5c7de19d1de4ba32508c0f7aa1`.
- Branch: `codex/google-oauth-refresh-hardening` (local).
- Scope respected: `yes`; no existing provider credentials were read, changed,
  merged, or deployed. This does not add Google account identity to stored data.

## Acceptance criteria

| Criterion | Evidence | Status |
|---|---|---|
| Missing, empty or malformed refresh token leaves existing credentials untouched | Synthetic controller regression test | pass |
| Missing or invalid expiry does not create an access-only connection | Synthetic controller regression test | pass |
| Complete exchange saves a new grant without reusing another account's token | Synthetic controller regression test | pass |
| Provider refresh, reconnect UX, or current production credential | No real-provider test in this slice | unverified |

## Validation receipts

| Command | Result | Relevant output or artifact |
|---|---|---|
| `npm run agent:task:check -- .agent/tasks/2026-11-01-google-refresh-safety.md` | pass | approved `CONNECTOR-LIVE-2` |
| Focused synthetic controller test | pass | reproduces missing-refresh failure against base code |
| `npm run verify` | pass with temporary port adaptation | 240 API tests, 25 web tests, 122 Chromium E2E; ports 13300/13301 and a dedicated test database, no user server reused |
| Default-port `npm run verify` | E2E not run | existing user server occupies port 3001; backend checks and build passed before E2E startup |
| `npm audit --omit=dev` | pass | zero reported vulnerabilities in production dependencies |
| `npm audit` | four moderate findings | `redis-memory-server` and its transitive `glob`, `rimraf`, `minimatch` test dependencies; no automatic upgrade attempted |
| `npm run release:smoke -- --api-origin https://api.fluxora.io.vn --web-origin https://fluxora.io.vn` | pass | three read-only GETs returned HTTP 200 |

For the isolated run, only URL/port literals in Playwright config and six E2E
files were temporarily redirected; those edits were reverted after the test.
The product source was unchanged during that run. Node v23.7.0 was used locally;
GitHub CI uses Node 22. The dedicated PostgreSQL test database was removed
after the owner requested cleanup; no production database was touched.

## Files changed

- `apps/api/src/credentials/google-oauth.controller.ts`
- `apps/api/src/credentials/google-oauth-refresh-safety.test.ts`
- `docs/02-architecture.md` and the task/report documents.

## Risks and follow-up

- A failure is currently presented as an API error response; a polished
  reconnect recovery screen is separate work. A previously damaged credential
  is not repaired automatically.
- The safe guard does not prove Google's real response or token refresh behavior.
  Never reuse an old token across Google account changes without verified identity.
- Google verification was submitted and is under review, not approved.
- An isolated restore was recorded on 28 October; a recent off-host backup and
  restore drill are not evidenced. Batch-mode SSH failed for the configured VPS
  account on 1 November, so current volumes and incident cause remain unknown.
- Landing E2E emitted GSAP empty-target warnings; no claim about their visual
  impact is made here.
