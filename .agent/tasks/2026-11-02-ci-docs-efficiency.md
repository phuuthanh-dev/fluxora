# Avoid redundant verification and deploy for documentation-only pushes

## Target slice IDs
- `L10.6`

## Reopen justification

The owner requested reducing the repeated full `main` verification and
production deployment observed after documentation-only PR #68. The prior
first-parent shortcut lost product changes when a later docs commit cancelled
the preceding product run. This slice must not reintroduce that regression.

## Outcome and safety boundaries

- Keep PR scope checks and cancel superseded runs of the same PR.
- Classify each complete push diff in Git; unknown or non-fast-forward ranges
  must fail closed or require full verification. Documentation-only main runs
  must not cancel product verification or trigger an application deployment.
- Automatic deployment must require the exact successful upstream push verify
  job and must not deploy a candidate older than later product changes. Preserve
  explicit immutable-SHA manual dispatch/rollback and serialized deployments.
- Test diff classification, missing metadata, rename, product-then-docs,
  overlapping product runs, upstream job conclusions and stale candidates.
  Do not use real production credentials or trigger an actual deployment.
- Follow the existing Git and local-workflow policy; verify in isolation at the
  end. GitHub scheduling and production behavior require later observation.
