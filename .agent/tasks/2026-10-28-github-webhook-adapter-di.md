# Production GitHub webhook adapter bootstrap repair

## Target slice IDs

- `RELEASE-REPAIR-1`

## Outcome

Make the GitHub webhook HTTP transport an explicit Nest provider so the
adapter can be constructed in production, while retaining injectable test
transport. Add a no-I/O application bootstrap regression test with scheduler,
maintenance, and Redis event ingress disabled.

## Proof

The focused bootstrap test fails on the broken constructor and proves the
adapter resolves from `AppModule`. The full quality gate passes before review.
The change contains no provider call or credential value.
