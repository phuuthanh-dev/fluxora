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
