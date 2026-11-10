# Task contract

## Identity
- Task ID: `2026-11-10-resource-selection-readiness`
- Base commit: `b49ba01fbfc305aeabe77f64cf3564c36847e71b`
- Working branch: `codex/resource-selection-readiness`; integrate into local develop, remote develop→main only.
- Implementer/reviewer: Codex directly.

## Target slice IDs
- `APP-EXPANSION-1`
- `EDITOR-QUALIFICATION-1`

## Outcome and scope
- Reuse shared resource picker for Jira issue search; credential-scoped server search, readable names, key/expression fallback.
- Add GitLab pipeline/MR, GitHub labels, Sentry issue and Vercel deployment selection using existing adapters and authenticated discovery.
- Add bounded Jira issue search/list action without another engine or node version.
- Review Jira production OAuth, privacy reporting/response and independent-user qualification; prepare concrete readiness evidence and keep public distribution/reporting gated on unresolved obligations and owner review.
- Compare n8n and evaluate Microsoft/Linear as proposals, not unsolicited connectors.

## Acceptance criteria
- [x] Stable IDs, safe parent/credential changes and workspace boundaries; loading/empty/retry and bounded paging.
- [x] Existing typed/expression configs continue to work; provider calls stay server-side.
- [x] Current Jira live evidence and production limitations accurately recorded.
- [x] Final audit and corrected focused tests; complete local results recorded in docs/50.
- [ ] One develop→main PR, clean full CI and merge (release evidence is recorded in that PR).

## Exclusions and safety
Preserve unrelated next-env diff, existing data and credentials. Keep local web/API with scheduler disabled. No arbitrary-data erasure, new credentials, expanded permissions or public Jira sharing without a concrete reviewed basis. No new app without selected use case. Only previously approved synthetic Jira test issue may receive a test comment.
