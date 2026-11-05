# Node operation consolidation

Owner decision, 2026-11-05: each operation uses one canonical, unsuffixed node
type and the current implementation. Remove parallel legacy and `.v2` node
types, numeric `nodeVersion`, and in-editor upgrade prompts. Workflow publish
versions and execution snapshots remain distinct.

This is a breaking change. Existing graphs with removed `.v2` types are not
automatically migrated and need to be rebuilt. Unsuffixed nodes use current
behavior: review their configurations and outputs before activating them.
This change does not delete workflows, credentials or execution history.

Scope: Uptime Kuma trigger; Google Drive, Sheets and Chat; Gmail read; Notion
search; Sentry issues; Vercel deployments; PostgreSQL and Supabase select.
Verification and release status are recorded in `docs/19-agent-state.md`.
