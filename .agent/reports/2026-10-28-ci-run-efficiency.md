# CI run efficiency report

> Superseded review: the implementation described below had an unsafe main
> cancellation/docs-only gap. The current local correction retains docs-only
> skipping for PRs, but verifies and deploys every main head until a reliable
> verified/deployed baseline exists. See `2026-10-28-ci-scope-risk.md` and
> the subsequent correction report. The original receipts below are historical.

## Outcome

- Status: `complete locally`
- One-sentence result: Quality Gate now cancels stale PR/main runs and skips
  expensive verification for documentation-only changes; production workflow
  runs are filtered to `main` and docs-only changes skip image build/deploy.

## Commit and scope

- Base commit: `41764e550a8530ff0381f2897a4b586e810a3f66`
- Scope: GitHub Actions workflow efficiency and contract coverage only.
- No VPS, deployment secret, database, application runtime, or provider call was
  changed or invoked.

## Acceptance criteria

| Criterion | Evidence | Status |
|---|---|---|
| Stale Quality Gate runs are cancelled for PR and main groups | `quality.yml` uses `cancel-in-progress: true` with PR-number/ref groups | pass |
| Docs-only changes keep a resolvable workflow record without expensive verification | Quality `scope` job computes changed files and conditionally skips `verify` | pass |
| Production workflow-run delivery is main-only | `deploy-production.yml` adds `branches: [main]` and retains the job-level success/branch defense | pass |
| Docs-only main changes do not build or deploy images | Deploy `scope` output gates both `build` and `deploy` jobs | pass |
| Immutable tags and production serialization remain protected | Deployment contract tests continue to assert full SHA tags, backup-before-migration, and `cancel-in-progress: false` for production deploy | pass |

## Validation receipts

| Command/check | Result |
|---|---|
| `npm run agent:task:check -- .agent/tasks/2026-10-28-ci-run-efficiency.md` | pass; reopened `L10.6` with concrete run-history justification |
| `npm run deployment:check` | pass; 12/12 contract tests |
| Ruby YAML parse for quality/deploy workflows | pass |
| `npm run verify` | pass; 148 API, 19 web, 29 Playwright tests |
| `git diff --check` | pass |

## Files changed

- `.github/workflows/quality.yml`
- `.github/workflows/deploy-production.yml`
- `scripts/deployment-contract.test.mjs`
- `docs/06-loop-engineering.md`
- `.agent/tasks/2026-10-28-ci-run-efficiency.md`
- `.agent/reports/2026-10-28-ci-run-efficiency.md`

## Risks and follow-up

- The change-scope logic intentionally treats unknown/empty diffs as requiring
  verification/deployment, which is the safer default.
- The production deploy concurrency remains serialized and non-cancellable to
  avoid interrupting migrations or an active release.
- GitHub Actions behavior should be confirmed in the first PR: one docs-only PR
  should show a successful lightweight Quality Gate and no production deploy
  run; one application PR should run the full gate.
