# MongoDB SRV support

## Outcome
- Existing credentials with an SRV-only hostname can load databases and
  collections and execute Find/Insert without replacing the secret.
- If the hostname has an address record, the existing direct TLS behavior is
  retained. Otherwise, ENOTFOUND triggers bounded MongoDB SRV lookup.
- Each SRV target must share the parent domain and be a valid DNS name. At most
  three seeds are connected individually, using the existing guarded DNS and
  TLS, until a writable primary or mongos is found. Server-advertised topology
  is not followed; no automatic mid-operation failover or SRV TXT options.
- Find and Insert share this path. Writes remain non-retryable once attempted.

## Live evidence
- Owner-authorized local credential: database and collection pickers returned
  results; a live manual Find against a probe collection with a filter excluding
  normal `_id` values succeeded and returned zero documents. The workflow was
  deactivated after the test. No real insert/update/delete was performed.
- The integration is local only. The real insert path, public deployment,
  other network configurations and replica failover remain unqualified.
- No credential values, hostnames or document content are included here.

## Verification
- Task: `.agent/tasks/2026-11-01-mongodb-srv.md`.
- Final isolated `npm run verify`: passed, 263 API, 26 web and 130 E2E tests.
- An earlier API-only invocation without an isolated `DATABASE_URL` failed two
  unrelated integration tests; the full gate used a separate test database.
