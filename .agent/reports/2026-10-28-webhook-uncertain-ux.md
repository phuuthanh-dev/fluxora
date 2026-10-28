# Uncertain webhook registration response

The registration panel now clears a previously displayed secret before another
write, reloads endpoint status when the write fails, and warns that the
endpoint may have changed even if no secret was received. Further mutation is
disabled while status reloads or while the status request is in error.

The full `npm run verify` passed with 164 API, 19 web, and 36 Playwright
tests. Browser coverage simulates a lost response and verifies that the old
secret disappears, status is requested again, and the warning remains.

This is not secret recovery or a two-phase rotation. A status read is a
snapshot and cannot prove that an earlier request has finished processing.
A successful server commit with a lost response can still require another
rotation and external webhook update. No actual provider or live endpoint was
used in this test.
