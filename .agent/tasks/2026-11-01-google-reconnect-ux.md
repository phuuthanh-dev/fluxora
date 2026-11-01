# Google reconnect recovery and scope clarity

## Identity

- Task ID: `2026-11-01-google-reconnect-ux`
- Base commit: `2514147f9d58081708190bf789265bdd796673b8`
- Working branch: `codex/google-oauth-recovery-ux`
- Implementer: Codex; reviewer: independent diff and test review.

## Target slice IDs

- `EDITOR-QUALIFICATION-1`

## Outcome

Make the deployed missing-refresh-token guard recoverable in the correct
workspace and disclose the existing broad Drive/Sheets connection scope.

## In scope

- Redirect this specific callback failure to a fixed local Connections route
  after signed state and current user validation; never include tokens or code.
- Display an accessible explanation and retry action, using workspace ownership.
- Reconcile the scope description with the owner's approved broad scope.

## Explicitly out of scope

- Changing OAuth scopes, account sign-in, token storage, existing credentials,
  other provider errors, Google review, deployment or live provider side effects.
- Copying outdated recording task documents or unverified tests unchanged.

## Acceptance criteria

- [ ] Missing refresh token never changes the saved credential and yields an actionable UI for the matching workspace.
- [ ] Invalid state is rejected rather than redirected; no raw token or authorization code reaches the redirect.
- [ ] Scope disclosure accurately describes existing access and keeps login distinct.
- [ ] The UI works in light/dark and at desktop/mobile widths.

## Required evidence

- Synthetic callback tests and Playwright tests without live provider calls.
- `npm run verify` in an isolated database and browser environment.
