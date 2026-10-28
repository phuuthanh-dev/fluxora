# CI scope optimization: release review

The uncommitted changes in `.github/workflows/quality.yml` cancel running
`main` quality workflows when a newer `main` push arrives, then classify the
new run using only that push's `before` and `head`. The uncommitted deployment
scope classifies the successful head against its immediate first parent.

Counterexample: push product commit A to `main`, then push documentation-only
commit B while A's quality run is in progress. B cancels A. B's quality scope
compares A to B, sees only documentation, and skips `verify`. Its workflow can
complete successfully, but deployment scope also compares A to B and skips
building and deploying. The product change introduced by A has therefore not
necessarily passed a main quality gate or reached production. This is an
analysis of the local workflow definition, not a claim that the scenario has
occurred on GitHub or in production.

The existing contract tests check workflow text, not this multi-commit
scenario. A safe correction needs to preserve verification and deployment for
all product changes since a known verified/deployed revision, including skipped
or cancelled runs. Until such a baseline is robustly tracked, full main
verification and deployment is the conservative fallback; PR cancellation and
other caching can still reduce cost. Preserve manual rollback behavior and
production serialization. Review the combined CI edits before release.
