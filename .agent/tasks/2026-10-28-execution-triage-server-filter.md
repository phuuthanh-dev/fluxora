# Execution triage server filter

## Target slice IDs

- `OPS-2`

## Outcome

Apply execution triage filters before cursor pagination on the server, so
future saved views can cover the complete workspace history rather than only
the records currently loaded into the browser. Preserve the existing list API
when no filter is provided.

## Proof

- API tests check owner scoping and filter-before-pagination for status groups.
- Browser tests check that changing a filter fetches a new server page and
  does not mislabel loaded-row counts as workspace totals.
- Run focused tests and the full quality gate without provider calls.

## Local evidence

- Focused API and browser tests passed; `npm run verify` passed with 32 Playwright tests.
- This is only the server-filter foundation of OPS-2; saved views and retention visibility remain pending.
