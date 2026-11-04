# Task contract

## Identity
- Task ID: `2026-11-04-steam-community-parity`
- Base commit: `cf1b43347f2a59d1a99033a02bdac8cc80427aef`
- Working branch: `develop`
- Implementer/reviewer: Codex

## Outcome
Offer the seven read operations present in the Steam community node through guided configuration, preserving existing Steam account snapshots and credentials.

## Target slice IDs
- `APP-EXPANSION-1`

## In scope
- User profile, friends, badges, vanity URL, owned games, recent games and achievements.
- Provider-bound requests, input validation, workspace credentials, bounded output and safe diagnostics.
- Mock behavior, operation-specific fields, capability metadata, tests and documentation.

## Explicitly out of scope
- Steam OAuth claims, private-data bypass, unsupported writes, publisher APIs, unverified live claims and trigger polling.

## Acceptance criteria
- [ ] All seven operations can be selected and exercised in mock mode; live reads use the selected workspace credential.
- [ ] Privacy, provider errors, malformed inputs and bounded results are handled explicitly.
- [ ] Existing account-snapshot graphs and outputs remain compatible.
- [ ] Run focused tests and final `npm run verify` in isolated infrastructure.

## Safety boundaries
- No live external actions or credentials in tests; no secrets in logs or client output.
- Keep local scheduler disabled and preserve other work.
