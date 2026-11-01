# Task contract

## Identity
- Task ID: `2026-11-01-chat-space-labels`
- Base commit: `0358e81475e55297c0525f491f62fca1a232f51d`
- Working branch: `codex/google-chat-space-labels`
- Implementer: Codex
- Reviewer: owner

## Outcome
Make unnamed Google Chat conversations distinguishable in the space picker.

## Target slice IDs
- `L4`

## Reopen justification
Owner-provided screenshot shows bare IDs when Google omits display names; live
testing also returned a 404. Existing L4 coverage did not identify these cases.

## In scope
- Preserve real space names, label unnamed resources by provider type, and test the mapping.
- Record the owner-approved live test and its limitations.

## Explicitly out of scope
- Additional OAuth scopes, cloud configuration changes, deploying, or sending another message.

## Acceptance criteria
- [x] Named spaces retain their names; unnamed conversations have honest type and ID labels.
- [x] Existing resource IDs and credentials remain unchanged.
- [x] Tests and live-result evidence are recorded without secrets.

## Required evidence
- Tests to add or update: Google Chat listing adapter tests.
- Commands to run: `npm run verify` and `npm run agent:task:check`.
- UI/manual proof: existing credential resource picker and one approved live test.

## Safety boundaries
- No secrets in logs, source, tests, or browser output.
- The owner explicitly authorized one live test to Notification; no further delivery is authorized by this contract.
