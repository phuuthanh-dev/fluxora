# Concurrent webhook registration

The previous code reproduced two successful concurrent creates with distinct
paths for one workflow on isolated PostgreSQL. Registration now locks the
workflow row and checks the published version and endpoint revision observed by
the caller. A second concurrent create or stale rotation returns a conflict;
existing duplicate registrations are rejected rather than silently modified.

The synthetic PostgreSQL concurrency check returned exactly one success and
one conflict for each pair of creates and rotations. Audit rollback and legacy
credential verification were also retested against isolated PostgreSQL. Full
`npm run verify` passed with 167 API, 19 web and 36 Playwright tests; a final
workspace typecheck passed after the last UI error-message change. An earlier
full gate was interrupted after accidentally running two Playwright processes
simultaneously; the completed gate ran sequentially.

This changes the registration POST contract: existing browser tabs or clients
must reload and send the published version plus the endpoint ID and timestamp
they observed. It does not add a database unique constraint; direct database
writes or old application versions not following the row-lock protocol can
still produce duplicates. Real provider delivery and production migration have
not been tested.
