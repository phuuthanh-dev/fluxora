# MongoDB guided configuration

## Outcome
- MongoDB connections offer separate fields with auto/direct/SRV choices or a
  masked connection string. Existing credentials retain auto detection.
- URI support is limited to one public TLS host and authSource, retryWrites,
  w, appName and tls; unsupported options fail validation. Automatic retries
  remain disabled for uncertain writes, even if the URI requests them.
- Find supports typed, AND-combined conditions with an explicit Apply step and
  preserves complex/unsupported filters in advanced JSON mode. Old object and
  string filters remain compatible; empty/incomplete inputs are not silently
  converted to broad queries.
- n8n supports both configuration types; its MongoDB Find uses a JSON query.
  The visual condition builder is a Fluxora usability improvement, not a claim
  that n8n supplies the same builder for MongoDB.

## Boundaries
- No real credential, provider data, live write, production deployment or remote
  publication was used. Existing user-provided local credential was only used
  by the existing read-only database/collection pickers during UI inspection.
- SRV remains bounded direct seed selection, not full replica-set failover.

## Verification
- Task: `.agent/tasks/2026-11-01-mongodb-guided-config.md`.
- Final isolated `npm run verify`: passed, 266 API, 28 web and 131 E2E.
- Focused browser verification passed in an isolated synthetic workspace. An
  initial selector in the test was ambiguous and was fixed before the gate.
