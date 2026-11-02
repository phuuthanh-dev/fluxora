# Clarify Supabase schema discovery denial

## Target slice IDs
- `APP-EXPANSION-1`
- `EDITOR-QUALIFICATION-1`

## Outcome
- An ambiguous HTTP 401 when loading Supabase schema must not imply the API
  key is necessarily invalid. Explain that permitted row reads may still work,
  and offer manual input or the existing optional scoped Management token.
- Preserve redacted provider errors, existing error codes and manual fallback.

## Evidence and boundaries
- On the owner-designated test project, the stored publishable key received
  HTTP 401 from the schema endpoint and HTTP 200 for one bounded row from the
  authorized test table. Only status and count were output; no key, provider
  body, or row content was logged.
- This local credential evidence does not identify the production credential
  or prove why the provider returned 401. No further live writes or key changes.
- Run final verification in an isolated environment without live provider calls.
