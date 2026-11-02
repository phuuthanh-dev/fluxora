# PostgreSQL verified TLS with a provider CA

## Target slice IDs
- `POSTGRES-1`
- `APP-EXPANSION-1`
- `EDITOR-QUALIFICATION-1`

## Outcome
- Permit an optional provider-supplied PEM CA certificate or CA chain in an
  encrypted PostgreSQL connection so services such as Supabase can be used
  without disabling certificate or hostname validation.
- Keep DNS pinning, bounded read-only queries and existing connections intact;
  apply the same TLS configuration to schema/table discovery and row reads.
- Give users a guided optional CA field, validate its size and format at the
  credential boundary, and never return saved credential payloads.
- Verify valid/invalid CA, TLS configuration and UI, then run the full gate
  in an isolated environment. Live test only the owner's dedicated test table.

## Evidence and boundaries
- The owner's test Supabase session pooler failed the unmodified Node TLS
  handshake with `SELF_SIGNED_CERT_IN_CHAIN`; no credential was sent.
- Supabase documents verified TLS using the provider root certificate:
  https://supabase.com/docs/guides/database/psql
- Do not set `rejectUnauthorized` to false or trust downloaded CA files
  globally. Do not modify the owner's database, provider settings, or secrets.
