# Atomic webhook registration

## Target slice IDs

- `WEBHOOK-ATOMIC-1`

## Outcome

Saving a registration or rotating its signing secret and writing the audit
record must succeed or fail together, so an audit error cannot leave the
client without the secret that was committed.

## Proof

Focused service tests and a synthetic PostgreSQL test simulate audit failure
and confirm rollback. Run the full gate without real provider credentials.
