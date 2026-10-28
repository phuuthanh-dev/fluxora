# Execution retention visibility

## Target slice IDs

- `OPS-2`

## Outcome

Show the configured automatic cleanup policy on the Executions page via an
owner-scoped read-only API, making clear that the terminal-run count limit is
system-wide. No execution data, secret, or provider URL is included.

## Proof

- Owner scoping and policy defaults are unit-tested.
- Browser test verifies the scope explanation.
- Full quality gate passes with mocked providers.

## Local evidence

- Owner authorization and policy tests passed; full `npm run verify` passed with 32 Playwright tests.
- Saved views are not part of this slice and remain pending in OPS-2.
