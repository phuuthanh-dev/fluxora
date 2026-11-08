# Journey qualification and Steam game news

## Identity

- Task ID: `2026-11-08-journey-steam-news`
- Base commit: `cec15a4f025138476c10c8c3095d92b464cb5e66`
- Working branch: `codex/steam-news-ux` (local)
- Implementer and reviewer: Codex

## Target slice IDs

- `EDITOR-QUALIFICATION-1`
- `CONNECTOR-LIVE-2`
- `APP-EXPANSION-1`

## Outcome and scope

Audit the authenticated user journey and existing Google/GitHub operations,
fix evidenced UX defects, inspect Google OAuth review read-only, and add a
bounded Steam game-news read using Steam's public GetNewsForApp API. Show the
scheduler's configured state honestly when runtime readiness is displayed;
configuration alone is not a heartbeat or proof of trigger delivery.

## Explicitly out of scope

- Provider writes, notifications, live AI calls, migration of old workflows,
  deletion of credentials or data, infrastructure changes, or new settings.
- Unbounded news content or claims of a Steam news trigger.

## Acceptance criteria

- [x] The dashboard distinguishes a disabled scheduler from queue/database
  readiness, without claiming a configured scheduler is actually healthy.
- [x] Users can select Steam game news, choose an app ID, and read a bounded
  response in mock and live modes without a Steam credential.
- [x] Existing Steam operations retain credential and privacy requirements.
- [x] Tests cover normal and error paths and the dashboard UI state.
- [x] Record provider review/qualification findings without overstating proof.
- [ ] Create one develop-to-main PR and merge after CI.

## Required evidence and safety

Use synthetic provider responses and local UI with scheduler disabled. Use
approved existing resources only for read-only qualification; no provider
messages or writes. Google review is read-only. Keep current data and local
services; avoid creating unnecessary resources. Owner explicitly authorizes
the final merge/deploy despite the task template's default exclusion.

Final local verify passed 1,075 API tests with zero skips, 74 web tests, and
216 Playwright tests on an isolated local database and Redis. An earlier full
run failed three UI tests due to a changed runtime heading; the heading was
restored with the scheduler warning on a separate line. A later run was stopped
after identifying and correcting a misleading public-news 403 message. The
final complete run followed both fixes. A direct read-only Steam adapter call
returned ten Portal 2 news items without reading a credential; this is not a
published workflow qualification. Google and GitHub picker reads used existing
connections and resources; no provider writes or messages were sent.
