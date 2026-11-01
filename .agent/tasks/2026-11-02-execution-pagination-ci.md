# Stabilize execution pagination CI coverage

## Identity
- Task ID: `2026-11-02-execution-pagination-ci`
- Branch: `codex/connector-discovery-qualification`

## Target slice IDs
- `OPS-1`, `EDITOR-QUALIFICATION-1`

## Outcome and acceptance
- Main quality gate run 41338466267 failed the execution-center pagination E2E while the PR run and local verify passed. Its fixture selects responses by request count, which is sensitive to extra initial requests.
- Model pages by the actual cursor query, assert the expected next cursor is requested, and keep the assertions that both pages remain visible. Do not weaken product coverage or claim the CI failure's precise request ordering was observed: no trace artifact was retained.
- Run the complete quality gate in isolation, preserving the user's local services and unrelated changes, and release via `develop` to `main` only after it passes.
