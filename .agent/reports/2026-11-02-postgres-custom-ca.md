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

The owner-created local PostgreSQL connection initially lacked its CA and
failed TLS before authentication. A replacement form was prepared with the
official public CA and non-secret connection settings, but the owner must
enter and submit the database password. No live read has yet succeeded. This
change is local and not yet released; production and sustained behavior are
not qualified. The user-owned local web and API remained running.
