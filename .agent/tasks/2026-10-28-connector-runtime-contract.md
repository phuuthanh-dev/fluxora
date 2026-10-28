# Connector runtime capability contract

## Target slice IDs

`CONNECTOR-CONTRACT-1`

## User-visible outcome

Keep the node library, workflow validation, and execution engine aligned as
new connector operations are added. A node type that is executable must be
declared once in the shared workflow contract; schema-only roadmap nodes must
remain importable but cannot be presented as executable by accident.

## Scope

- Add a shared executable-node-type list and type guard to
  `@workflow/contracts`.
- Use the shared contract in the web catalog parity checks and the API
  execution boundary without changing stable node type strings or stored
  graph payloads.
- Add regression tests proving every executable contract has an available
  catalog definition and every available catalog definition is executable.
- Preserve schema-only roadmap nodes as valid imported graph types.
- Update the connector audit and loop/state ledgers.
- Do not call providers, deploy, or change protected OPS files.

## Acceptance criteria

- The executable list contains exactly the currently executable MVP node
  types, including core nodes, Google/Steam/notification/HTTP nodes, and
  GitHub operations/triggers.
- The web catalog and shared executable contract cannot silently drift.
- API runtime code has an explicit shared capability guard before dispatching
  an executable node; unknown/schema-only nodes still return the existing
  `NODE_UNAVAILABLE` failure.
- Existing graph compatibility and roadmap-node import behavior remain intact.
- Focused tests and `npm run verify` pass.

## Reopen justification

This is a new contract-parity gap identified during the all-connector audit;
it does not reopen a completed connector implementation slice.

## Evidence boundary

Provider calls remain mocked or absent. Live provider and VPS qualification
remain owner/operator-gated in the release documents.

## Completion evidence

- `npm run agent:task:check -- .agent/tasks/2026-10-28-connector-runtime-contract.md` passed.
- `npm run verify` passed: API 198/198, web 22/22, Playwright 39/39, typechecks, builds, code graph, deployment checks, release checks, and tracked-secret scan.
- No provider calls or protected OPS files were changed.
