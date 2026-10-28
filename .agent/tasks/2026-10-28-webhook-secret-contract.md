# One-time webhook signing-secret contract

## Target slice IDs

- `WEBHOOK-SECRET-CONTRACT-1`

## Outcome

The owner chose a newly generated GitHub webhook signing secret displayed once
at creation or rotation, and asked to compare other platforms before deciding
the generic webhook behavior. Keep the existing one-time generic header secret
after comparing the provider documentation. Align security guidance with this
narrowly scoped exception and prohibit caching of the response; never return
saved secrets on later reads.

## Proof

Verify response metadata and existing registration tests; run the full gate.
Do not use real provider credentials or send requests to live endpoints.
