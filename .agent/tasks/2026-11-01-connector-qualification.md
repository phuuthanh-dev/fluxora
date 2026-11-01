# Connector qualification and scalable discovery

## Identity
- Task ID: `2026-11-01-connector-qualification`
- Base commit: `8263d9f3eaa2b37444f6115e556c32ef770e164a`
- Working branch: `codex/connector-discovery-qualification`
- Implementer/reviewer: Codex

## Target slice IDs
- `APP-EXPANSION-1`, `EDITOR-QUALIFICATION-1`, `OPS-1`

## Outcome and acceptance
- Preserve the RSS CDATA fix and verify real provider evidence without overstating scope.
- Diagnose Trello picker failures and improve actionable redacted errors; address verified Vercel and Supabase picker limitations without broadening credentials.
- Improve app-to-operation discovery with search, keyboard navigation, light/dark states and stable persisted node identifiers.
- At the owner's explicit request, expose at most two trailing characters of an allowlisted long opaque-looking API key/token to the authenticated workspace owner; never expose passwords, OAuth credentials, webhook URLs, short secrets or the full value. Tests cover isolation and masking. Update product/security documentation for the explicit exception; length and format do not prove entropy.
- Record every shipped operation, scopes and outstanding provider qualification. No unsupported provider feature is represented as implemented.
- Keep the requested local web/API session running; avoid background schedule or cleanup side effects.

## Evidence and boundaries
- Verify at end: focused API and browser tests, typecheck, codegraph, full quality gate with isolated services.
- No provider credentials or response payloads in logs, fixtures or reports; no additional external writes or permissions without authorization.
- Keep unrelated worktree changes, deployment settings and existing user data intact.
