# Task contract

## Identity
- Task ID: `2026-11-04-riot-lol-connector`
- Base commit: `d538b7b2a78692b4534533403c02740809604889`
- Working branch: `develop`
- Implementer/reviewer: Codex

## Outcome
Prepare a user-owned Riot API connection and League of Legends read operations with guided app-first discovery and documented provider restrictions.

## Target slice IDs
- `APP-EXPANSION-1`

## Scope
- Workspace credential and read operations for Riot account, summoner, matches, spectator, ranked entries, champion mastery, based on provider API availability.
- Mock tests, safe provider errors, region routing, per-operation UI, documentation and final verify.

## Out of scope
- VALORANT, RSO, tournament APIs, unsupported writes, real account secrets in repository or logs, claiming public approval or provider qualification without evidence.

## Safety boundaries
- Do not enable a shared Riot key or misrepresent a personal/development key as suitable for public use.
- Treat Riot's data broker restriction and public approval as unresolved until Riot confirms the actual workflow use case.
- Preserve existing workflows, workspace ownership and local scheduler state.
