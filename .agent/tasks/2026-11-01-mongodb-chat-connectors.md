# MongoDB and Google Chat OAuth connectors

## Identity

- Task ID: `2026-11-01-mongodb-chat-connectors`
- Base commit: `04a0b53`
- Working branch: `codex/mongodb-chat-connectors`
- Implementer: Codex; reviewer: independent diff and tests.

## Target slice IDs

- `L4`

## Reopen justification

The owner explicitly requests MongoDB and Google Chat OAuth runtime support,
which were roadmap-only during the original completed integration slice.

## Outcome

Workspace owners can configure bounded MongoDB document reads/inserts and Google Chat
OAuth message delivery, with correct provider credentials and mock execution.

## In scope

- Encrypted, workspace-owned connection types and safe runtime adapters.
- Structured node configuration and authenticated resource discovery where safe.
- Owner-scoped OAuth with separate Google Chat connection and scopes.
- Controlled egress, timeouts, retry classification, sanitized output and errors.
- Unit/integration/browser tests and documentation; final combined quality gate.

## Explicitly out of scope

- Live provider calls, modifying Google Cloud consent, production deployment,
  MongoDB update/delete operations, credentials in fixtures, or unrelated refactoring.

## Acceptance criteria

- [x] MongoDB find and insert support bounded data and secure connections;
      uncertain inserts must not be automatically retried.
- [x] Chat connects without replacing existing Drive/Sheets credentials and can
      send a message using a selected space with manual/expression fallback.
- [x] Mock runs do not contact providers; live execution remains guarded.
- [x] Credential access is owner/workspace scoped and never exposes secrets.
- [x] Both connectors have runtime, picker, UI and failure-path coverage.
- [x] Final `npm run verify` passes in isolated local infrastructure.
