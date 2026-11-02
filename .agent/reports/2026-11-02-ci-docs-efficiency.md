# Documentation-only CI efficiency

## Outcome

- Status: complete locally; GitHub deployment and scheduling validation pending.
- The proposed workflow skips full verification and application deployment for documentation-only pushes without cancelling an earlier product verification; this behavior is not yet live.

## Commit and scope

- Base commit: `0dcd84d`.
- Implementation: see the commit containing this report and `.agent/tasks/2026-11-02-ci-docs-efficiency.md`.
- Scope respected: yes; no production credentials, provider calls, or production deployment.

## Acceptance criteria

| Criterion | Evidence | Status |
|---|---|---|
| Conservative diff classification and product-then-docs safety | `scripts/deployment-contract.test.mjs`; per-main-SHA concurrency | Local pass |
| Automatic deploy requires matching successful verification and non-stale product SHA | `scripts/ci-upstream-verification.mjs`; deployment qualification step | Local pass; actual GitHub execution pending |
| Serial deploy and manual immutable-SHA dispatch preserved | Workflow contract test | Local pass |

## Validation receipts

| Command | Result | Relevant output or artifact |
|---|---|---|
| `npm run agent:task:check -- .agent/tasks/2026-11-02-ci-docs-efficiency.md` | pass | task scope |
| `node --test scripts/deployment-contract.test.mjs` | pass | 16 tests |
| `npm run verify` | pass | API 352 passed and 1 skipped; web 32 passed; Playwright 145 passed, synthetic local database and Redis |

The first verify attempt used a non-default `WEB_ORIGIN`, conflicting with two existing tests that expect port 3000; rerunning with the expected origin passed.

A subsequent read-only check piped the real GitHub API jobs response for completed main quality run `41410307068`, attempt 1, into `ci-upstream-verification.mjs` with its exact head SHA. The classifier returned `verified`. This confirms the current GitHub response shape is accepted for one successful run; it does not exercise the new hosted workflow, skipped jobs, reruns, scheduling, or deployment.

## Files changed

- GitHub quality/deploy workflows; change-scope and upstream-job classifiers; deployment contract tests; loop engineering documentation; task and report.

## Risks and follow-up

- GitHub must exercise a docs-only push, product-then-docs overlap, and overlapping product runs after a reviewed release. Local tests cannot prove hosted scheduler or `workflow_run` behavior.
- `queue: max` is bounded by GitHub; alert on failed qualification or queued deployment.
- A documentation-only main commit can leave the deployed SHA at its previous product commit even though executable files are identical.
- Never skip existing production backup or migration guards.
