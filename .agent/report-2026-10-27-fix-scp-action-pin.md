# Implementation report

## Slice

Corrected the invalid immutable `appleboy/scp-action` reference used by both deployment workflows.

## Changes

- Updated staging and production to the verified `v0.1.7` commit.
- Added a deployment contract assertion for that exact pin.

## Verification

- `git ls-remote https://github.com/appleboy/scp-action.git refs/tags/v0.1.7` confirmed the commit.
- `npm run deployment:check` — passed (9 tests).
- `npm run verify` — passed locally, including 114 API tests, 14 web tests, 22 Playwright E2E tests, lint, typecheck, and builds.
- The preceding merged staging run confirmed both Docker image builds and pushes, then exposed this invalid action reference at deploy-job setup.

## Safety

No application code, provider credentials, VPS configuration, or deployment behavior was changed.
