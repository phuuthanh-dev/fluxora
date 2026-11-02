# Make app-library favorites unambiguous

## Identity

- Task ID: `2026-11-02-node-library-favorites`
- Base commit: `71053277778681717076fc1208d40fab058cef54`
- Working branch: `develop`
- Implementer: Codex
- Reviewer: Codex and CI

## Target slice IDs

- `APP-EXPANSION-1`
- `EDITOR-QUALIFICATION-1`

## Outcome

Unavailable roadmap operations cannot be favorited, while assistive technology identifies the app for favorite controls with identical operation names.

## In scope

- Shared app-library favorite controls, existing browser journeys, and corresponding documentation.

## Explicitly out of scope

- Catalog operations, persisted favorites migration, provider calls, credentials, CSS, and migrations.

## Acceptance criteria

- [ ] Planned operations have no favorite control and remain visibly unavailable.
- [ ] Favorite controls for same-named operations identify their app; ready operations remain favoritable.
- [ ] Existing keyboard/favorites journeys and final full verification pass on isolated services.

## Safety boundaries

- No real credentials or provider calls. Keep the user's local web/API running.
