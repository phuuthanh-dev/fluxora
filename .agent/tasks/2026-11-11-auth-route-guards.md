# Authentication route corrections

## Identity
- Task ID: `2026-11-11-auth-route-guards`; base `49a229de442a5d606cc7a0a60e1f6ba17ec893d3`; branch `develop`.

## Target slice IDs
- `AUTH-ROUTES-1`

## Scope and acceptance
- Authenticated visitors to login/register are redirected to the workspace; guests can use both forms, including OAuth and password recovery.
- Private pages redirect unauthenticated users to login with a safe internal return destination; admin denies non-admins without presenting the admin shell. API authorization remains authoritative.
- Failed logout remains on the authenticated page and provides a useful error. Auth failures use codes/status, not message text; network failures are distinct.
- Verify actual local browser behavior and simulated failures; run one final isolated `npm run verify`, then one develop-to-main PR and merge on passing CI.
- Preserve local data and the unrelated next-env change. No provider writes or security-policy changes.
