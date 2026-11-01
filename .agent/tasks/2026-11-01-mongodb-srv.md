# MongoDB SRV connector

## Identity
- Task ID: `2026-11-01-mongodb-srv`
- Base commit: `a7aa0cc172819e35dc4b7ed71671f74427cedcc7`
- Working branch: `codex/mongodb-srv-support`
- Implementer: Codex; reviewer: independent diff and tests.

## Target slice IDs
- `L4`

## Reopen justification
The owner requested support after a live test found an SRV-only host; see
`.agent/reports/2026-11-01-mongodb-live-diagnostic.md`.

## Outcome
Existing MongoDB SRV credentials can be used by the picker, Find and Insert,
without bypassing guarded DNS, TLS or uncertain-write boundaries.

## In scope
- Bounded SRV resolution, seed validation and primary selection.
- Existing direct-connection compatibility; understandable credential guidance.
- Synthetic tests, owner-authorized live read-only test and final quality gate.

## Explicitly out of scope
- Live writes, private-network access, production deployment or secret exposure.

## Acceptance criteria
- [x] The existing SRV credential works without replacement.
- [x] Direct connections and workspace ownership remain unchanged.
- [x] SRV targets cannot bypass public-address DNS guards or TLS.
- [x] Uncertain writes remain non-retryable; tests cover resolver and selection.
- [x] Limitations and real provider results are documented.

## Required evidence
- Tests to add or update: resolver, targets, guarded connections, Find/Insert.
- Commands to run: `npm run agent:task:check` and `npm run verify`.
- UI/manual proof: owner-authorized read-only resource picker and Find run.

## Safety boundaries
- No credentials or document content in logs, fixtures or reports.
- No insert against a real collection without a separately designated target.
