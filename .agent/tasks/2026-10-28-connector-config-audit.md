# Task contract

## Identity
- Task ID: `2026-10-28-connector-config-audit`
- Base: `16d53a5ee6b0ef19bfc26383a551f080c4b8ac36`
- Branch: `codex/connector-config-audit`

## Outcome
Audit existing app connectors and make Google Drive and Sheets inspector fields match the selected operation without altering saved graphs.

## Target slice IDs
- `CONNECTOR-CONFIG-1`

## Scope
- Record evidence and production gaps per connector in docs.
- Show Drive and Sheets configuration fields only for their relevant operation; preserve all stored values.
- Add browser regression coverage; do not change provider transport, credentials, or live data.

## Required evidence
- Focused browser tests, `npm run agent:task:check`, `npm run verify`.
- No live provider writes, deploy, or unrelated user changes.
