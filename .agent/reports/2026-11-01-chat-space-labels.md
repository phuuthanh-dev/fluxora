# Google Chat space labels and live smoke

## Outcome
- Named spaces retain their Google display name. Unnamed conversations use the
  provider's space type and the original resource ID, without invented names.
- Local browser inspection with an owner-supplied OAuth connection showed one
  named space and two direct messages. No additional OAuth scope was requested.
- The first owner-approved live send to Notification failed with Google Chat
  HTTP 404. After owner-approved Chat app configuration, one separately approved
  retry succeeded with `delivered: true` and a provider message ID. The separate
  manual-trigger test workflow was deactivated after testing.

## Diagnosis and limits
- Google Cloud showed the Chat API enabled and its app configuration empty.
  Following owner approval, the Fluxora Chat app configuration was saved with
  non-interactive features and a default avatar. The same workflow then sent
  successfully; this strongly implicates the missing configuration, although
  the first error's detailed provider response was not recorded.
- After saving, Cloud displayed app status LIVE and error logging enabled by
  default. This is not evidence of Marketplace publication or broad-user
  qualification. Google warned that personal accounts have Chat app limits.
- Participant names are not available from the returned space display names;
  resolving them requires separate investigation of permissions and consent.

## Evidence
- Owner-approved manual mock run succeeded. The first live run failed with 404;
  an owner-approved second run succeeded following Cloud configuration.
- Provider metadata was inspected only through Fluxora's authenticated resource
  picker. No token, password, or provider secret is recorded here.
- The task contract is `.agent/tasks/2026-11-01-chat-space-labels.md`.
- `npm run verify` passed in a separate local worktree and synthetic database:
  259 API, 26 web and 130 Playwright tests. The first full attempt had five
  credential-test failures because the synthetic encryption key was invalid;
  correcting that test-only key and rerunning the complete gate passed.
