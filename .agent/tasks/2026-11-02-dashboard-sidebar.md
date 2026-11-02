# Dashboard sidebar

## Identity
- Task ID: `2026-11-02-dashboard-sidebar`
- Base commit: `1d0cee8bb703eac07a59b6e25c33235b7c04f590`
- Working branch: `codex/dashboard-glass-sidebar` (local only)
- Implementer/reviewer: Codex

## Outcome
Replace the management pages' horizontal navigation with a reusable, collapsible glass sidebar inspired by the owner's 5.8-second reference video. Explain Reddit access and assess parallel-agent delivery without claiming a new provider grant.

## Target slice IDs
- `L8.4`

## Reopen justification
Owner explicitly requested a sidebar based on FDown.vn_Instagram_Video_Downloader_c8b1.mp4 on 2026-11-02. The existing shell is horizontal; this is a changed navigation requirement, not a repeat of the completed shell implementation.

## In scope
- Dashboard, Connections, Executions and Account share one sidebar, search, grouped actual destinations, active/hover states, collapse preference, accessible tooltips, theme and existing account actions.
- Mobile drawer, keyboard/focus and reduced-motion behavior; preserve selected workspace in navigation.
- Read current Reddit policy and existing project evidence; document the distinction between API implementation and provider access.
- Explain bounded parallel agent work and its cost/coordination tradeoffs.

## Explicitly out of scope
- No new provider APIs, credentials, database changes, placeholder features, or editor canvas layout migration.
- No Reddit approval submission, Devvit integration, external messages or duplicated provider tests.

## Acceptance criteria
- [x] Glass sidebar has expanded/compact modes with readable navigation in both themes.
- [x] Actual destinations preserve workspace; theme/account/logout behavior remains available.
- [x] Mobile drawer closes on navigation and Escape, traps and restores focus; collapsed controls remain labelled.
- [x] Collapse preference survives navigation; unavailable storage never blocks navigation.
- [x] Motion is scoped, reversible and respects reduced motion.
- [x] Editor retains horizontal shell and unsaved navigation guard.
- [x] Local web/API remain available; final verification is batched after implementation.

## Required evidence
- Update existing shell regression for sidebar account menu placement; add one combined navigation/persistence/accessibility journey.
- Final `npm run codegraph:generate`, `npm run verify`; synthetic data only in isolated test environment.
- Review light/dark, compact/expanded/mobile screenshots and a local transition recording.

## Safety boundaries
Preserve `.env`, local data, and pre-existing `apps/web/next-env.d.ts`. Task branches stay local; no provider secrets in logs or reports.
