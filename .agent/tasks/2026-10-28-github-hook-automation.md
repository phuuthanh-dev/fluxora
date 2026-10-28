# Task contract

## Identity
- Task ID: `2026-10-28-github-hook-automation`
- Base commit: `16d53a5ee6b0ef19bfc26383a551f080c4b8ac36`
- Branch: `codex/github-webhook-automation`
- Implementer: Codex

## Outcome
Allow users to manage a GitHub repository webhook through their own workspace credential, with clear lifecycle state and safe recovery.

## Target slice IDs
- `GH-HOOK-AUTO-1`

## Scope and boundaries
- Preserve existing manually managed endpoints and separate signing secrets.
- Record provider ownership and operation state; never update or delete unknown provider webhooks.
- Handle uncertain GitHub outcomes, concurrency, version changes, secret safety and recorded-identity reconciliation explicitly.
- Use a GitHub-specific adapter behind a narrow provider lifecycle interface.
- Do not call live providers or deploy without an explicit owner-approved sandbox.

## Required evidence
- Focused adapter and lifecycle tests including failures and concurrency.
- Focused reconciliation tests proving matching uncertainty can recover while drift, ambiguous provider responses and unknown identities remain manual boundaries.
- Browser coverage for configuration, statuses and manual compatibility.
- `npm run verify`, migration verification and owner review before merge.
