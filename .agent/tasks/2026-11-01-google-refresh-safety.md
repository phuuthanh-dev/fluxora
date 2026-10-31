# Google OAuth refresh-token safety

## Identity

- Task ID: `2026-11-01-google-refresh-safety`
- Base commit: `e429d8b1b5552b5c7de19d1de4ba32508c0f7aa1`
- Working branch: `codex/google-oauth-refresh-hardening`
- Implementer: Codex
- Reviewer: independent review of diff and tests

## Target slice IDs

- `CONNECTOR-LIVE-2`

## Outcome

Prevent Google OAuth reconnect from replacing a working offline credential with
an access-only credential, without combining credentials from different accounts.

## In scope

- Validate token exchange before persisting a credential and cover it with synthetic tests.
- Document the error and the limit of simulated provider responses.

## Explicitly out of scope

- Live provider requests, deployment, existing credential changes, scope changes,
  and using old refresh tokens without verified account identity.

## Acceptance criteria

- [ ] A missing, empty, or malformed refresh token never reaches the credential vault.
- [ ] A valid access and refresh token is saved using the existing authorization flow.
- [ ] No token is exposed in errors, redirects, or test output.

## Required evidence

- Synthetic callback tests and `npm run verify`.
- No real provider calls or production writes.
