# Gmail trigger and Calendar expansion

## Scope and status

- Gmail polling trigger with selectable interval, workspace credential,
  mailbox identity, checkpoint lease, durable delivery receipts, atomic
  execution reservation, status, explicit reset, and published-version
  continuity is implemented and validated with synthetic provider responses.
  Pub/Sub push is not implemented.
- Google Calendar has guided calendar/event selection, list/get/create/update/
  delete and availability. Creation uses stable IDs for retries. Event picker
  returns up to 50 upcoming events; manual ID/expression remains available.
  Calendar trigger is not implemented.
- The additive checkpoint migration was subsequently applied to the local
  database for the owner-authorized checks below; production was not changed.
- Public scope approval and production deployment are separate from synthetic
  tests and the limited live checks below.

## Verification

- Full `npm run verify` passed on an isolated source copy with disposable
  PostgreSQL, Redis and separate application ports: 311 API tests, 30 web tests
  and 137 Playwright tests. The integration suite includes a lost Redis job and
  recovery using the real isolated database and queue.
- In that automated gate, Gmail and Calendar provider responses were mocked.
  The separate owner-authorized live checks below do not establish public OAuth
  scope approval, sustained behavior or production stability.
- Filters use message state at polling time; receipt retention has no automatic
  cleanup yet. Reset or replacing a trigger can discard pending messages and
  requires explicit acknowledgement.

## Follow-up review: approval recovery

- Review found that recovering a lost Gmail job after approval could restart at
  an already-visited trigger and falsely mark the run successful. Recovery now
  resumes at the approved node's successors, or refuses ambiguous state.
- Synthetic unit coverage and an isolated PostgreSQL/Redis test exercise the
  resumed path, including a successor node that must actually execute. A full
  `npm run verify` on an isolated copy passed with 312 API, 30 web and 137
  browser tests; only test ports differed from the checked-in configuration.
- Read-only Cloud Console review on 2026-11-01 showed verified branding, data
  access under review, and declared Drive/Sheets scopes. Gmail and Calendar
  scopes were not present in the displayed scope list at the time of review.

## Owner-authorized local provider checks — 2026-11-01

- Applied the three additive Gmail/Calendar migrations to the local `workflow`
  database; the owner authorized enabling Gmail API and Google Calendar API in
  the Fluxora Cloud project and authorized separate OAuth connections. This
  does not constitute Google verification for public Gmail/Calendar scopes.
- One local live Calendar workflow created, read, updated and deleted the same
  clearly labelled event on the owner's primary calendar without attendees;
  each node succeeded and delete returned `deleted: true`. The test workflow
  was deactivated. Event listing action and availability remain unqualified;
  the calendar picker did list calendars successfully.
- The owner asked for a self-addressed test email. Gmail Read returned exactly
  that one message through a bounded query; the test workflow was deactivated.
- A live Gmail Trigger probe read real Gmail history and executed the trigger
  and condition for the designated test message. Another new message existed
  in the same history page, so this one-off probe filtered the returned IDs
  before the application's poll read message contents. The other message was
  not read. This validates a controlled path, not unmodified multi-message
  polling or production reliability. A second self-addressed test message was
  sent to attempt an unmodified poll, but the history also contained other new
  messages, so the poll was not performed. Both test emails were left in the
  mailbox. The trigger workflow was deactivated and the global local scheduler
  stayed disabled.
