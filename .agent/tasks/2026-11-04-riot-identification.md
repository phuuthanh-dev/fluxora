# Task contract

## Identity
- Task ID: `2026-11-04-riot-identification`
- Base commit: `231abfe99dfd3af7499423318c32ce64aa4a5e86`
- Working branch: `develop`
- Implementer/reviewer: Codex

## Outcome
Make Riot and its games distinguishable in the app library and credentials while respecting Riot's logo restrictions.

## Target slice IDs
- `APP-EXPANSION-1`

## In scope
- Reuse accessible generic pictograms and existing theme tokens for game identification.
- Document Riot production applications and the explicit logo policy boundary.

## Explicitly out of scope
- Official Riot or game logos without provider permission; unapproved public Riot API calls.

## Acceptance criteria
- [x] Each catalog game and the Riot connection have a distinguishable generic icon in both themes.
- [x] Documentation separates submitted applications from approved API access.

## Required evidence
- `npm run verify` passed in an isolated PostgreSQL/Redis environment, including 208 E2E tests; light and dark editor visuals were inspected locally.

## Safety boundaries
- Preserve existing credentials and workflow behavior; do not expose keys or claim Riot approval.
