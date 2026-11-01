# Optional Supabase Management API table discovery

## Identity
- Task ID: `2026-11-02-supabase-optional-discovery`
- Branch: `codex/connector-discovery-qualification`

## Target slice IDs
- `APP-EXPANSION-1`

## Outcome and acceptance
- Let an owner optionally supply a project-scoped Supabase Management API access token with database read permission for table discovery, while retaining the Data API key for workflow row access and RLS.
- Use the official fixed Management API endpoint with a server-side bearer token; never place tokens in URLs, logs, workflow data, returned provider errors, or saved-token hints. Validate host inputs and bound response size and time.
- Preserve old connections, manual input and the Data API discovery path. Do not auto-fallback from a failed management credential to an elevated service-role key. Clearly state that the optional token can grant broader read access than the Data API key and that discovery does not grant row access.
- Cover authorization and error paths, request headers, malformed inputs, owner isolation, UI secret input and fallback. No real token creation or provider mutation; user may choose to configure the optional token later.
- Run verification at the end in an isolated worktree and database while keeping the user's local web and API available. Document exact qualification boundaries.
