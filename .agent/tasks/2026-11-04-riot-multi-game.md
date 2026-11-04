# Task contract

## Identity
- Task ID: `2026-11-04-riot-multi-game`
- Base commit: `80caa1a`
- Working branch: `develop`
- Implementer/reviewer: Codex

## Outcome
Extend the existing Riot integration with discoverable, bounded TFT post-game reads and accurately represent other games whose access is restricted.

## Target slice IDs
- `APP-EXPANSION-1`

## In scope
- Reuse workspace-owned Riot credentials, bounded request handling, rate guard and existing editor conventions.
- TFT account lookup, match list, match detail and ranked entries, with tests and policy documentation.
- Clearly identify VALORANT and other games as unavailable when production/RSO access is required.

## Explicitly out of scope
- Workarounds for Riot access restrictions, real-time TFT scouting, unofficial APIs, public deployment and shared keys.

## Acceptance criteria
- [ ] TFT operations have guided input, isolated backend execution, deterministic mocks and correct provider routing.
- [ ] Game-specific access limits and untested cases are explicit in the UI and documentation.

## Required evidence
- Tests for validation, routing, errors, editor discovery and credentials.
- Final `npm run verify` when feasible; no token in logs or fixtures.

## Safety boundaries
- Keep existing LoL workflows and saved credentials compatible. Do not deploy or expose a personal key in production.
- Do not use VALORANT player data without the required Riot authorization and player opt-in.
