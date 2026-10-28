# Concurrent webhook registration

## Target slice IDs

- `WEBHOOK-CONCURRENCY-1`

## Outcome

Lock registration writes per workflow and require callers to submit the
published version and the endpoint revision they observed. Reject stale
writes and existing duplicate registrations without rotating a secret. Older
clients missing the required revision must reload rather than write unsafely.

## Proof

Use isolated PostgreSQL to exercise concurrent creates and concurrent
rotations, plus API and browser regression tests. Run the full quality gate.
No provider calls or production endpoint changes.
