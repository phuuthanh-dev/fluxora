# Task contract

## Identity
- Task ID: `2026-10-28-github-picker-owner`
- Base commit: `16d53a5ee6b0ef19bfc26383a551f080c4b8ac36`
- Working branch: `codex/github-picker-owner-clarity`
- Implementer: Codex
- Reviewer: Codex and owner

## Outcome
Make it clear which loaded GitHub repository owner is selected and when a saved value is not in loaded results.

## Target slice IDs
- `GH-PICKER-OWNER-1`

## In scope
- Filter loaded GitHub repository results by owner without implying server-wide coverage.
- Clarify preserved manual or filtered values and that listing does not guarantee permission.
- Regression coverage for filtering, selection and pagination.

## Explicitly out of scope
- Changing GitHub token scopes, credentials, authorization or webhook routing.
- Deployment and live external writes.

## Acceptance criteria
- Owner choices reflect loaded repositories and preserve existing configured values.
- UI explains unloaded or filtered values and does not claim action permissions.
- Filtering, manual mode, pagination and accessibility have focused coverage.

## Required evidence
- Focused Playwright coverage and `npm run verify`.
- Test both theme contrast via existing regression tests.

## Safety boundaries
- Do not print or use real provider credentials in tests.
- Do not deploy or merge without user authorization.

## Completion evidence

- Focused `e2e/webhook-registration.spec.ts` passed 8/8 with mocked provider responses.
- `npm run verify` passed: API 198/198, web 22/22, Playwright 39/39, builds, typechecks, deployment checks, release checks, and tracked-secret scan.
- The owner filter remains limited to loaded repository pages and does not claim GitHub permissions.
