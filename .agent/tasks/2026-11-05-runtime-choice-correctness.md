# Runtime choice correctness

## Identity
- Task ID: `2026-11-05-runtime-choice-correctness`
- Base commit: `d22dd018851e066595ff7337556eaa279b968869`
- Working branch: `codex/nx-runtime-correctness`
- Implementer and reviewer: Codex

## Target slice IDs
- `APP-EXPANSION-1`

## Outcome
Reject an unsupported or unresolved If operator and approval notification provider instead of silently choosing another behavior. Update stale release handoff documents so completed work is not proposed again.

## Scope and acceptance
- Use the existing choice validation and execution failure patterns; no parallel versioning or new schema layer.
- Static invalid inputs fail at publish. If expressions with invalid or missing results fail at execution; approval provider is selected statically for correct readiness checks. Preserve ordinary defaults when the choice is omitted.
- Account for approval credential readiness; do not infer a provider for a dynamic expression during live preflight.
- Cover valid choices, defaults, invalid and unresolved expressions in both run modes, without reading credentials or sending notifications.
- Document PR #89 release evidence and genuine outstanding gaps; do not claim provider qualification.
- Explain in the editor that a mock success does not verify live connections or all inputs.
- Remove mock-only Sheets output retained for old workflows and match provider write-response shapes instead.
- Reject invalid provided ranges and invalid write tables in Sheets mock while preserving sample read templates without a spreadsheet connection.
- Use the same Steam ID validation for Snapshot and individual Steam actions; reject invalid IDs before provider requests.
- Align the Steam Snapshot mock profile ID field with the live Steam response.
- Check HTTP URL syntax and reuse live header-shape checks in mock mode without reading credentials or sending a request.
- Reject empty notification content and an invalid provided Telegram destination in mock as well as live, without requiring credentials for mock.
- Reject invalid or unresolved SMTP body format in mock and live; retain text as the omitted-field default.
- Preserve the owner-selected broad Drive/Sheets OAuth scopes with a direct authorization URL regression check; do not change scopes.
- Remove exact duplicate fixtures and pass-through wrappers left by node consolidation while retaining meaningful coverage.

## Safety boundaries
Use synthetic fixtures only. No provider calls or database/credential deletion. Verify once the batch is complete. Keep localhost web/API available.
