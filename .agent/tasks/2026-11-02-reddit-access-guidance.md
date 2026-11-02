# Reddit access guidance

## Target slice IDs
- `APP-EXPANSION-1`
- `EDITOR-QUALIFICATION-1`

## Outcome
- Show existing and prospective Reddit users that public Data API access is
  being retired, and link to Reddit's official migration timeline.
- Preserve the existing connector, credentials and operation identifiers for
  authorized users; do not claim Devvit support or disable existing connections.
- Exercise the connection form's guidance in the existing browser test and
  run the applicable final quality checks without live provider calls.

## Evidence and boundaries
- Reddit's official October 2026 changelog states new Public Data API access
  requests closed on October 31, 2026, and remaining access ends March 2027.
- Keep existing credentials secret and do not make external provider writes.
