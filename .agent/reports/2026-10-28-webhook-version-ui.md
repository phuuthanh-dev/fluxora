# Webhook registration version correctness

The editor derives registration configuration from the published graph, not
the editable draft, matching the backend. If only the draft has a webhook,
registration remains disabled until it is published. When an existing endpoint
is pinned to an earlier version, the UI explains that rotation is needed to
apply the setup shown for the current published version.

`npm run verify` passed with 35 Playwright tests, including cases where draft
and published triggers differ and where the draft alone has a trigger. Tests
mock provider endpoints; no production registration was altered.
