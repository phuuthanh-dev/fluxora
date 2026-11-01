# Supabase discovery fallback after production observation

## Identity
- Task ID: `2026-11-02-supabase-discovery-fallback`
- Branch: `codex/connector-discovery-qualification`

## Target slice IDs
- `APP-EXPANSION-1`

## Outcome and acceptance
- In production, the existing publishable key can read a permitted test row but schema discovery displays `SUPABASE_TABLES_UNAVAILABLE`, leaving the table picker disabled. Preserve manual table input and the existing value for both known discovery denials and generic discovery errors.
- Return safe, actionable guidance for known provider failure classes without returning provider response bodies, URLs, or credential fragments. Do not identify an unknown failure as a permission denial.
- Allow retry without losing the configured table. Credential/owner authorization remains unchanged.
- Cover known and unknown failures, the existing-value fallback and retry. Run the required verification only after implementation is complete, in isolation from the user's local web/API and database.
- Record the live RSS and Vercel evidence separately from mock proof; Supabase live qualification remains open until the new behavior is deployed and observed.
