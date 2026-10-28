# CI scope correction

The documentation-only scope optimization can no longer skip verification on
`main`: each main push runs the full Quality Gate, and every successful main
gate remains eligible for the serialized immutable-image deployment. This
ensures a docs-only commit following a cancelled product gate still verifies
and deploys the product changes in its tree. A documentation-only pull request
may still skip expensive verification. All main pushes, including docs-only,
incur full verification and deployment until a reliable verified/deployed
baseline is implemented.

The CI scope script is exercised in a temporary Git repository with a product
commit followed by a docs-only commit. Tests also cover docs-only and product
PRs, a product file moved under docs, and an invalid comparison revision.
Failed diffs fail the scope job instead of silently skipping verification.
`npm run deployment:check` passed 13/13 after the final scope-script change.
The full `npm run verify` passed with 163 API, 19 web, and 33 Playwright
tests; it began before the final cleanup to the scope script, which was then
retested by the focused deployment contract suite.

These tests do not execute GitHub Actions' scheduler, remote workflow events,
or VPS deployment. The first real PR and main run need observation. No
production configuration or credentials were changed.
