# ACCOUNT-1

## Outcome
Owner-approved account management and recovery, reusing existing auth, identities,
sessions, brand and controls. Local branch codex/account-recovery; base 3ee77fc.

## Target slice IDs
- `ACCOUNT-1`

## Scope
Settings/account, name update, password change, own session list/revocation,
forgot/reset routes, independent system SMTP mail, additive migration, docs/tests.
No email address change, verification, avatar uploads, account deletion, new OAuth
linking behavior, deployment or real email. Existing identity unlink safeguards stay.

## Acceptance
- Owner-scoped operations; passwords require current password or a one-use reset.
- Reset token: 32 random bytes, hash for lookup, 30-minute expiry; consume atomically,
  invalidate outstanding tokens and all sessions, no automatic sign-in.
- Generic request response and no token in API/logs; throttle by IP and account.
- Durable encrypted mail outbox independent of workspace credentials/executions;
  explicit operator SMTP configuration, TLS, no provider/debug output or automatic
  retry of uncertain sends. Unconfigured delivery is clearly unavailable.
- Shared light/dark UI, loading/errors, keyboard controls and noindex routes.
- Synthetic database concurrency/security tests, mocked mail, E2E and full verify.
- Commit and merge local develop only. Production activation remains separate.

## Evidence
OWASP Forgot Password Cheat Sheet reviewed 2026-10-30:
https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
Use existing agent harness and generated code graph. Record actual receipts.
