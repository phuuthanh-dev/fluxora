# Task contract

## Identity
- Task ID: `2026-11-18-shopify-client-credentials`
- Base commit: `6250bcc`
- Working branch: `develop`
- Implementer: Codex
- Reviewer: Codex

## Outcome
Connect a Shopify store using its own custom-app client ID and secret, with automatic access token acquisition, while retaining manual tokens.

## Target slice IDs
- `APP-EXPANSION-1`

## In scope
- Shopify credential form, server-side token exchange, Shopify shared OAuth removal, focused tests and documentation.
- Visual review of affected forms in both themes on desktop and mobile.

## Explicitly out of scope
- Other providers, App Store registration, payments, unrelated changes and deletion of existing data.

## Acceptance criteria
- [x] Shopify app credentials work in discovery and execution, securely reacquiring expired tokens. Live product discovery passed on the owner's test store; expiry and full execution were tested with mocks.
- [x] Manual tokens continue to work; users can replace prior shared OAuth credentials without data deletion.
- [x] Shopify shared OAuth endpoints and UI are removed while unrelated OAuth remains.
- [x] Focused checks and requested final verification pass.

## Required evidence
- Commands: `npm run agent:task:check -- .agent/tasks/2026-11-18-shopify-client-credentials.md`, focused tests, relevant typechecks, code graph and requested final verification.
- UI/manual proof: desktop and mobile light/dark connection form.

## Safety boundaries
- Preserve stored credentials, workflows, existing edits and unrelated providers; do not reveal secrets or register or pay for an app.
