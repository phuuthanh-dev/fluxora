# GitHub webhook delivery report

`GH-HARDEN-1` verifies the raw-body HMAC before accepting a GitHub setup ping,
including when the workflow is not live. Ping creates no execution; regular
events still require an active workflow and matching event and repository.
GitHub delivery IDs are scoped to the registration and passed to the existing
execution idempotency mechanism. This limits duplicates while the execution
record is retained, but is not cryptographic replay prevention because the
delivery header is not signed.

`npm run verify` passed: 162 API, 19 web, and 33 Playwright tests; provider
calls were mocked. A subsequent focused webhook test run passed 13 tests,
including controller header validation added after the full gate began.
Verification used the existing local CI edits, which are not part of this
slice. No actual GitHub webhook, live workflow, or production system was changed.
