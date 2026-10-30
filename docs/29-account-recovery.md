# Account management and recovery — ACCOUNT-1

Approved 2026-10-30. This extends existing account authentication; it does not change
workflow credentials, OAuth scopes or execution behavior.

## User experience

- Avatar menu → Account settings → `/settings/account`.
- Profile: edit display name; email remains read-only.
- Password: current password + new password + confirmation, 12–128 characters.
  Success signs out all sessions and returns to sign-in with a confirmation.
- Active sessions: created/expiry times and current-session marker, individual
  non-current revocation or sign out all others. Up to 100 recent active sessions
  are displayed; bulk revocation covers all other sessions. Device/IP information
  is not collected or fabricated. Existing avatar-menu sign-out handles this session.
- Linked accounts: show existing Google/GitHub sign-in and Steam profile links;
  existing unlink/last-login-method protections remain in the avatar menu.
- Login → Forgot password → `/forgot-password`. If system email is disabled,
  show unavailable + support/social sign-in guidance, not false delivery success.
- A recovery email opens `/reset-password#token=…`. JavaScript captures the token
  in memory and removes the fragment, including a fresh link opened on the same
  route. It never stores the token in browser storage. Reloading after removal
  requires reopening the email link. No reset is performed by visiting the link.
- Recovery success requires a fresh sign-in. Invalid/expired/used links offer a
  new request. All three routes are noindex and excluded from sitemap/robots.
- Shared auth navigation, controls and semantic colors; desktop/mobile light/dark,
  keyboard focus, pending/error/success states. No new animation framework.

## API and persistence

All routes are under `/api/v1/auth`:

| Method/path | Contract |
|---|---|
| GET/PATCH `account` | Authenticated profile read/name update; hashes never serialized |
| GET `account/sessions` | Own active sessions, opaque row IDs and current marker |
| DELETE `account/sessions/:id` | Owner-scoped revoke; clear cookie if current |
| POST `account/sessions/revoke-others` | Keep current token, revoke all other sessions |
| POST `account/password` | Verify current password; atomically update/revoke/audit |
| GET `password/recovery` | Whether installation email is configured/enabled |
| POST `password/forgot` | Generic 202 for known/unknown accounts; 503 if unavailable |
| POST `password/reset` | Atomically consume valid token; no new session; 204 |

Migration `20261030000000_account_recovery` only adds PasswordReset/AccountMail
tables, indexes, enum and User relations; it does not modify existing user,
workflow or credential rows. Apply using `npm run db:deploy`, never reset/seed.
An older application can ignore the added tables; leave the migration in place
when rolling back application images.

Reset tokens use 32 cryptographically random bytes and SHA-256 lookup hashes,
with a 30-minute expiry. User-row locking makes concurrent consume single-use.
Changing a password invalidates all sessions and remaining reset tokens. Login
rechecks its verified password snapshot under that same lock before creating a
session. Audit failure rolls the whole change back. New recovery requests replace
older outstanding tokens; they never change the password before consumption.

Mutation requests require JSON (except DELETE), reject a different Origin, and
are limited to 20 per IP per 15 minutes in bounded API-process memory. Requests
also have a database-backed per-account 60-second cooldown. Generic requests wait
at least 300ms and never wait for SMTP. This reduces timing differences; it is not
a guarantee of identical latency under load. The IP limiter resets on API restart
and is per replica; multi-replica deployment needs a shared limiter/edge policy.

## System email configuration

Set these on the API installation, not inside a user's Connections:

| Variable | Meaning |
|---|---|
| `ACCOUNT_MAIL_ENABLED` | `false` by default; explicitly enable after qualification |
| `ACCOUNT_SMTP_HOST` | Operator's SMTP submission hostname |
| `ACCOUNT_SMTP_PORT` | `465` for implicit TLS or `587` for required STARTTLS |
| `ACCOUNT_SMTP_USER` / `ACCOUNT_SMTP_PASSWORD` | System sender authentication |
| `ACCOUNT_MAIL_FROM` | Single verified sender email address |
| `WEB_ORIGIN` | Trusted frontend origin; HTTPS in production; never inferred from Host |
| `APP_ENCRYPTION_KEY` | Existing 32-byte vault key; retain it across deploys |

Production compose already forwards `.env.production`; no infrastructure change
is required. Enabled incomplete configuration fails API startup. Do not enable
using a random user's workflow SMTP credential. Keep values out of commits,
screenshots and logs; never replace the existing encryption key for this feature.

The API polls every five seconds, claims up to ten messages, sends with strict
certificate verification and bounded connection/socket timeouts, then scrubs the
encrypted recipient/subject/body payload. A password-change notice contains no
password or reset token. Both mail kinds are transactional security messages only.
An uncertain send is marked failed; a stale SENDING claim becomes failed after
two minutes, never re-dispatched. SMTP acceptance is not proof of inbox delivery.

While enabled, maintenance scrubs expired pending mail, removes terminal receipts
older than seven days and reset rows expired over one day ago. Disabled mail stops
dispatch and this cleanup. Encrypted queued payloads may therefore remain until
reenabled/operator cleanup. Sender-side mail logs/retention are provider-managed.

## Activation and proof boundary

Local automated validation uses synthetic users, an isolated PostgreSQL schema,
stubbed transport and browser request fixtures. It must not send real mail or
inspect user credential values. See `.agent/reports/2026-10-30-account-recovery.md`.

Before enabling for real users, qualify the operator's verified sender, TLS,
SPF/DKIM/DMARC as appropriate, inbox/spam delivery, trusted reset domain and
failure logs using an explicitly authorized recipient. Merge/release still goes
through local develop → remote develop → main with the exact-head quality gate.
This task does not claim delivery qualification, deployment or full production
readiness. Account deletion, email changes/verification and MFA are outside scope.

Reference: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), reviewed 2026-10-30.
