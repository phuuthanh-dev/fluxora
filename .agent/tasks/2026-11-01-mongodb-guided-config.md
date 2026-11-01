# MongoDB guided configuration

## Identity
- Task ID: `2026-11-01-mongodb-guided-config`
- Base commit: `81ee2f6`
- Working branch: `codex/mongodb-guided-config`
- Implementer: Codex; reviewer: owner.

## Target slice IDs
- `L4`

## Reopen justification
The owner observed technical JSON-only fields and requested connection options
and an approachable MongoDB filter configuration.

## Outcome
Make MongoDB credentials and common Find filters easier to configure while
preserving existing graphs, credentials, and advanced JSON.

## In scope
- Accurate MongoDB connection selection and conditional inputs.
- Guided simple filters and lossless advanced JSON fallback.
- Synthetic unit/browser coverage and final isolated quality gate.

## Explicitly out of scope
- Live database writes, unsupported MongoDB options, deployment or exposing secrets.

## Acceptance criteria
- [x] Supported connection choices show the appropriate fields and retain egress protections.
- [x] Common filters are configurable without typing JSON and preserve value types.
- [x] Existing/complex filter JSON is never silently discarded.
- [x] User sees clear limitations and errors for unsupported formats.
- [x] Tests and UI verification pass.

## Required evidence
- Tests to add or update: credential parsing, resolver mode, filter round-trip and UI.
- Commands to run: `npm run agent:task:check` and `npm run verify`.
- UI/manual proof: inspect guided controls on desktop.

## Safety boundaries
- Never print or store credentials in source, logs, tests, reports or browser output.
- No live writes or production deployment.
