# Google Calendar initial read slice

## Outcome

- Added a separate Google Calendar OAuth/manual-token connection scoped to
  read calendar events and a List upcoming events action for the primary
  calendar. Results are bounded and event data may be in execution history.
- Mock runs use synthetic events; OAuth validates the returned scope and does
  not overwrite the Drive/Sheets, Gmail or Chat connection.
- Other calendar selection, create/update, event triggers, real-provider
  testing, public OAuth consent configuration and deployment are outstanding.
- Gmail new-message trigger remains unimplemented. It needs checkpoint,
  dispatch recovery, active version changes and expiration handling.

## Evidence

- Calendar OAuth and adapter tests passed with mocked provider responses.
- Full typecheck and focused Playwright calendar configuration test passed;
  Playwright used an isolated database and synthetic credentials. Its additive
  enum migration was applied only to that isolated database.
- Full `npm run verify` remains outstanding for this slice.
