# Supabase schema discovery HTTP 401

Targets: `APP-EXPANSION-1`, `EDITOR-QUALIFICATION-1`.

On the owner-designated local test connection, the actual publishable key
received HTTP 401 from the schema endpoint but HTTP 200 for a bounded read of
one row from the authorized test table. Only HTTP status, classifications and
row count were output. No key, provider response body or row content was logged.
The returned body did not match either previously recognized message; this does
not establish the provider's reason, nor whether production uses the same key.

The 401 guidance now distinguishes schema authorization from row permissions,
preserves manual input, and suggests the existing optional Management token
with database-read access. It does not assert that every 401 is a valid key or
that a management token bypasses row-level security. Existing error codes and
the separate management-token denial message remain unchanged.

Final isolated verification and release status are pending.
