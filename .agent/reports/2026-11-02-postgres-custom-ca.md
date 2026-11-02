# PostgreSQL provider CA — 2026-11-02

Targets: `POSTGRES-1`, `APP-EXPANSION-1`, `EDITOR-QUALIFICATION-1`.

The owner's dedicated Supabase session pooler passed Fluxora's public DNS
validation but its TLS handshake failed with `SELF_SIGNED_CERT_IN_CHAIN` under
the default Node trust store. Supabase's own documentation prescribes its
downloadable CA for verified connections. Using that official public CA, a
separate no-credential Node TLS handshake verified the pooler's certificate
and hostname. This establishes TLS compatibility, not database authentication.

PostgreSQL connections now optionally accept a bounded PEM CA chain by paste or
file. Server validation accepts only CA certificates, preserves Node's default
roots, and adds the supplied roots only for that connection. The pinned address,
original TLS hostname, certificate verification and read-only query path remain
in effect for discovery and execution. The payload is encrypted with the other
credential fields and is not returned in summaries. See
[Supabase TLS guidance](https://supabase.com/docs/guides/database/psql) and
[node-postgres SSL configuration](https://node-postgres.com/features/ssl).

Validation on an isolated database, loopback Redis and separate web/API ports:
`npm run verify` passed: API 353, web 32 and Playwright 144. The first run hit
a synthetic private-key marker in the tracked-secret scan; the fixture was
rewritten without changing the rejection case. The next full run reached
143/144 because an existing long onboarding case timed out at Retry test;
that case passed twice independently, and a subsequent complete gate passed.
The precise cause of the timeout remains unconfirmed. Existing GSAP/WebGL
warnings did not fail the gate.

An additional isolated PostgreSQL 16 test exercised the actual
`readPostgresRows` implementation with a synthetic CA and SCRAM authentication.
A bounded read succeeded with the custom CA. The connection was rejected with
the custom CA absent, an unrelated CA, a mismatched TLS hostname, an incorrect
password, and an ungranted table. The temporary server was stopped afterward.
Only the DNS resolver was replaced to address loopback; this does not establish
public DNS behavior, a complete workflow, vault integration, Supabase
authentication, or production operation.

The owner-created local PostgreSQL connection initially lacked its CA and
failed TLS before authentication. The owner subsequently rotated the local
connection, entering the password and the official public CA. A direct runtime
check against the designated Supabase session pooler authenticated with
verified TLS and read one row from `public.fluxora_connector_test`.

An existing local test workflow was then configured with a manual trigger and
PostgreSQL Select rows, limited to that table and one row. Schema and table
discovery succeeded. A single published LIVE execution and both node executions
were `SUCCEEDED`, with a count of one. The test workflow was deactivated after
the run; its execution history, which may contain the test row, remains in the
local database. Only status and count were printed in the diagnostic; no
credential or row content was printed. This is one local end-to-end run, not
evidence of sustained service or a production PostgreSQL connection.

Release update: PR [#65](https://github.com/phuuthanh-dev/fluxora/pull/65)
merged as `87542ed`. Its PR and main quality gates passed, and
[production deployment](https://github.com/phuuthanh-dev/fluxora/actions/runs/41391212408)
completed successfully. Production home, login, API health and readiness
responded HTTP 200 afterward. This is a deployment and availability check;
The live PostgreSQL read was subsequently qualified locally as described above;
production PostgreSQL authentication remains unverified.
