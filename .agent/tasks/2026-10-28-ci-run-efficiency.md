# Task contract

## Identity

- Task ID: `2026-10-28-ci-run-efficiency`
- Base commit: `41764e550a8530ff0381f2897a4b586e810a3f66`
- Working branch: `main`
- Implementer/reviewer: `Codex and human owner`

## Target slice IDs

- `L10.6`

## Reopen justification

The closed CI/CD efficiency slice did not prevent production deployment
workflow runs from being created for non-main Quality Gate completions, and
Quality Gate still spent the full verification budget for documentation-only
changes. GitHub run history confirms repeated skipped deployment records and
multi-minute verification runs. This is a concrete workflow-efficiency
regression/changed operational requirement, not a request to repeat the prior
implementation unchanged.

## Outcome

Reduce redundant GitHub Actions work without weakening required checks,
immutable release tags, production serialization, or deployment safety.

## In scope

- Cancel stale Quality Gate runs for both PR and main groups.
- Add a lightweight change-scope job so documentation-only PRs skip expensive
  verification; always verify main because a prior run may have been canceled.
- Restrict production `workflow_run` delivery to `main`.
- Deploy every verified main head until a verified/deployed baseline can be
  tracked safely; retain manual dispatch and serialized production deploys.
- Update deployment contract tests and documentation receipts.

## Explicitly out of scope

- Changing application tests, database migrations, credentials, deployment
  secrets, VPS state, or production concurrency serialization.
- Removing the post-merge main Quality Gate.
- Adding unpinned third-party actions.

## Acceptance criteria

- [x] Quality Gate cancels stale runs for its PR/main concurrency groups.
- [x] Docs-only PRs skip expensive verification; every main push is fully verified.
- [x] Deploy production receives only successful main Quality Gate completions
  and does not skip a head merely because its last commit changed documentation.
- [x] Deployment contract tests pass and no immutable-tag or production
  serialization contract is weakened.
