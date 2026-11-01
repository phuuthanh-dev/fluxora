# Notion and PostgreSQL connectors

## Identity
- Base: PR #55 head `b5a831f`; local branch `codex/notion-postgres-connectors`.
- Owner requested Notion and PostgreSQL following the connector UX audit.

## Target slice IDs
- `NOTION-1`
- `POSTGRES-1`

## Outcome
Add independently owned workspace connections and operation-specific nodes.
Prefer resource selection and structured controls with manual fallback; retain
existing runner, credential vault, input/output and failure contracts.

## Safety and evidence
- No live provider calls or customer database writes without specific approval.
- PostgreSQL connections require bounded target validation at connection time,
  TLS, safe identifiers and parameterized values; SQL text is not accepted by
  the guided operation. Private-host support is an explicit later decision.
- Notion requests target its official API; errors and logs never include tokens.
- Use deterministic mocked tests and isolated database tests. Full verify is
  required before a ready-for-review release; PR #55 CI is separate.
- Do not mark an app available before its credential, executor, catalog, mock
  behavior, readiness, UI and tests are complete.
