# Gmail connector

## Identity
- Base: `278b325` (PR #56 head); working branch `codex/gmail-connector`.
- User requested the third proposed app, Gmail, and additional workflow ideas.

## Target slice IDs
- `GMAIL-1`

## Outcome
Add a dedicated Gmail connection, read action and durable new-mail trigger,
with owner-scoped credentials, resource choices and mock/live separation.

## Boundaries
- Gmail scopes are independent from Google account sign-in, Drive and Chat.
- No OAuth consent configuration changes, external mailbox reads or provider
  writes without owner action and an approved test resource.
- Restrict output size and MIME nesting; never expose tokens or raw errors.
- Trigger must not silently lose or duplicate messages across restart,
  concurrent scheduler instances, inactive workflows, or expired cursors.
- User-facing UI must distinguish polling from instant push and test/mock from
  live. Do not expose an unavailable trigger as functional.
- Verify with unit, deterministic provider mocks, durable integration tests,
  Playwright and final isolated `npm run verify`; production qualification and
  Google restricted-scope review are separate.
