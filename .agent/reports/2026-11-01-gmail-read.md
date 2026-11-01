# Gmail read action — partial GMAIL-1

## Outcome

- Local branch `codex/gmail-connector`, based on `278b325` (PR #56 head).
- Added an independently scoped Gmail OAuth/manual-token connection and a Read
  messages action. Users can select Inbox, unread Inbox, or all mail, optionally
  add a Gmail search query, and request up to ten messages. Results include
  bounded headers, snippet and plain-text body; attachments are not read.
- Mock mode uses synthetic data. Live mode calls the fixed Gmail API with the
  workspace connection; the UI warns that returned content can be recorded in
  execution history. No actual mailbox, Google Cloud setting, production
  migration or production deployment was touched for this slice.
- Gmail new-message trigger, pagination through all results, attachment
  downloads and sending messages are not implemented. Do not describe this as
  a complete Gmail integration or exactly-once delivery.
- The `gmail.readonly` OAuth scope is restricted and needs Google consent
  configuration and the appropriate verification before public release.

## Validation

- Final `npm run verify` passed in a separate temporary worktree and synthetic
  PostgreSQL database: 279 API tests, 30 web tests and 133 Playwright tests.
  The new enum migration ran only against the synthetic database.
- The first full run revealed a keyboard navigation regression in the app
  catalogue; Gmail was moved after the existing Email app. The focused keyboard
  test and the final full gate passed afterward.
- Gmail provider and OAuth tests used mocked responses; no real Gmail inbox or
  sustained production behavior has been qualified.

## Remaining work

- Implement the durable trigger contract in `docs/32-gmail-use-cases.md`,
  including activation baseline, versioned checkpoints, lease ownership,
  idempotent enqueue/recovery and visible handling of expired Gmail history.
- Agree on Gmail data retention, update Cloud consent and undergo required
  verification before a real owner-authorized test and release.
- PR #56 for the previous Notion/PostgreSQL slices was open with CI passing
  when this report was written. Gmail is separate and must not be silently
  included in that PR.
