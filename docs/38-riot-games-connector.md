# Riot Games / League of Legends — feasibility and scope

Updated 2026-11-04. This is a technical assessment, not Riot approval.

## Provider constraints

- [Riot's developer portal](https://developer.riotgames.com/docs/portal) states that development keys deactivate every 24 hours. Personal keys are for the developer or a small private community; Riot explicitly prohibits public products using personal or development keys. Production access is a separate registration and review.
- Riot's [League of Legends policy](https://developer.riotgames.com/docs/lol) prohibits applications acting as data brokers between the Riot API and another third-party company. Fluxora can send workflow output to other services. Whether a user-owned key and a private or public workflow is permitted is unresolved; describe the actual use to Riot and obtain their guidance before enabling this connector for public use. Do not describe a personal key as an approved shared Fluxora production key.
- [Riot requires](https://developer.riotgames.com/docs/portal) clients receiving HTTP 429 to halt future API calls for the duration in `Retry-After`, and describes application, method and service limits. The prototype uses a persistent, global PostgreSQL lock and cooldown shared by workers; it deliberately serializes calls across all keys and regions. When a 429 has no usable `Retry-After`, it fails closed indefinitely and needs operator investigation. A crash before the cooldown transaction commits remains a limitation, and this is not evidence of production-grade rate limiting.
- League platform routes and regional routes are distinct. [Riot documents](https://developer.riotgames.com/docs/lol#routing-values) `vn2` as a Vietnam platform and `sea` as a regional route. Account and match endpoint routing must follow the applicable current official API reference; do not infer the host from user-provided URLs.
- Player data may appear in workflow execution history. Scope and retention must be clear; API keys remain per workspace, encrypted server-side and never exposed in logs or response bodies.
- Riot specifies product attribution and security requirements in its League policy. Avoid implying endorsement. Do not use official logos without an appropriate basis.
- [VALORANT](https://developer.riotgames.com/docs/valorant) does not support personal key applications and its player-data applications require player opt-in through Riot Sign On; do not represent an API key as equivalent to RSO.

## Community comparison and requested first game

The user selected League of Legends first. The [n8n community node](https://github.com/Izakun/n8n-nodes-leagueoflegends) describes 10 read actions: Riot ID → account, PUUID → account, summoner, active game, match IDs, match details, match timeline, ranked entries, all champion masteries, and top champion masteries. Its README is evidence of that community package's scope, not an official Riot promise or proof Fluxora works against the live API. Existing Fluxora library convention is App → individually searchable actions; backend and credentials can be shared.

## Qualification checklist

- [ ] Record Riot's decision/guidance for the described private workflow and, separately, any public Fluxora use.
- [x] An owner-provided personal key was saved locally for a private prototype; it is not a key for every Fluxora user.
- [ ] Check current Riot API endpoint/reference, access tier, routing, identifiers, pagination and response size for every action.
- [ ] Define bounded input and output, non-disclosing errors, server-side scoped credential access and no key in logs.
- [x] Implement a conservative cross-worker 429 cooldown; unit tests and an isolated PostgreSQL integration exercise concurrency and persisted cooldown.
- [ ] Establish crash/restart behavior under real traffic and an operator recovery procedure; the current global lock and indefinite fail-closed state are prototype tradeoffs.
- [x] All ten listed operations returned successfully in a private live test using one account and the Vietnam selection. The current-game check reported no active game, so an active-game response was not tested. An initial timeline exceeded the original 1 MB cap; a retry succeeded after adding a separate bounded 5 MB allowance. Large outputs use a lazily expanded tree in the editor. These checks do not establish broad coverage or long-term reliability.
- [ ] Test more accounts, regions, active-game responses and pagination. The match list currently has one page (up to 100), a fixed set of filters and a 1 MB response limit (5 MB for timelines); very large timelines may exceed it. Do not claim complete n8n community parity.
- [ ] Review retention, player privacy, required attribution, provider policy, migration and production deployment before public availability.

No public Riot approval or continuous reliability test has been established by this document. The generic game icon is intentional; do not imply Riot endorsement or use its official logos without an appropriate basis.

## Other Riot games (2026-11-04)

- TFT exposes six separate discoverable actions backed by the existing Riot connection: Riot ID and PUUID account lookups, match IDs, match details, ranked entries and service status. TFT uses the documented Americas/Europe/Asia regional routing for match history and platform routing for ranked/status. Eligibility of an existing key for TFT is determined by Riot; a League key is not guaranteed to include it. The implementation has mock/transport tests; live qualification is separate. The [TFT policy](https://developer.riotgames.com/docs/tft) prohibits real-time scouting and prescriptive in-game advice; the connector does not expose spectator endpoints.
- [VALORANT](https://developer.riotgames.com/docs/valorant) does not offer personal keys and requires Riot Sign On for player data. [Legends of Runeterra](https://developer.riotgames.com/docs/lor) and [2XKO](https://developer.riotgames.com/docs/2xko) also state player opt-in/RSO requirements. These games are visible only as unavailable roadmap entries; no player data or fake OAuth connection is implemented.
- A publicly available Fluxora connector remains subject to Riot approval, the registered product and actual workflow use case, and required attribution. No production or cross-game access is inferred from a personal League key.
