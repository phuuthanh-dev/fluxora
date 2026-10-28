# GitHub webhook delivery

## Target slice IDs

- `GH-HARDEN-1`

## Outcome

Handle signed GitHub setup pings without starting a workflow, including before
activation; deduplicate repeated normal deliveries by `X-GitHub-Delivery`.
Keep inactive workflows closed to normal events, and verify HMAC before
acknowledging any ping.

## Proof

- Tests cover signed/invalid pings, inactive normal events, and delivery IDs.
- Full quality gate passes with mocked providers.
