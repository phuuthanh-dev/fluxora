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
- The additive checkpoint migration has not been applied to the user's database.
- Real Gmail/Calendar provider access, public scope approval and production
  deployment are separate from synthetic tests.

## Verification

- Full `npm run verify` passed on an isolated source copy with disposable
  PostgreSQL, Redis and separate application ports: 311 API tests, 30 web tests
  and 137 Playwright tests. The integration suite includes a lost Redis job and
  recovery using the real isolated database and queue.
- Gmail and Calendar provider responses were mocked. No live mailbox or
  calendar was accessed; OAuth scope approval, real-provider behavior and
  production stability are not established by these tests.
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
  scopes were not present in the displayed scope list. No Cloud changes or
  live Gmail/Calendar calls were made in this review.
