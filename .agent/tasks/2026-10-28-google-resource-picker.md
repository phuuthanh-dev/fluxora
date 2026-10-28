# Google Drive and Sheets resource picker

## Target slice IDs

- `GOOGLE-UX-1`

## Outcome

Allow owners to choose accessible Drive files and Google spreadsheets through
the shared resource-picker UI using the existing Google connection. Preserve
manual ID/expression input and existing OAuth scopes.

## Proof

- Owner-scoped backend proxy returns only file metadata and bounded page tokens.
- Provider calls are mocked in tests; token and refresh token never reach UI.
- Browser tests cover file selection, pagination, and manual fallback.
- Full quality gate passes.

## Local evidence

- `npm run verify` passed with 33 Playwright tests; provider calls in tests are mocked.
- Drive download picker covers text files; Google-native documents require export support not implemented in this slice.
- Real Google account and scope qualification remain outstanding.
