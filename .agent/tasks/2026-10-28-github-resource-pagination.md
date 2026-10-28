# GitHub repository pagination

## Target slice IDs

- `GH-UX-2`

## Outcome

Let users load additional accessible GitHub repositories through the existing
owner-scoped resource picker, with bounded pagination, retryable error states,
and no disclosure of connector secrets. Search applies to loaded repositories.

## Acceptance

- Owner-protected API accepts bounded page numbers and returns safe metadata.
- Picker preserves earlier pages, selected values, and offers load more/retry.
- Automated tests use mocked provider responses; no real GitHub calls.
- Run focused tests and the repository quality gate.

## Local evidence

- `npm run verify` passed with 31 Playwright tests after the picker change.
- Mocked GitHub API tests and browser tests cover paging and selection.
- Real provider discovery remains unverified.
