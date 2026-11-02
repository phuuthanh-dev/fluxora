# Remove OAuth client-secret identification hints

## Identity

- Task ID: `2026-11-02-reddit-client-secret-hint`
- Base commit: `d852bf2e108ceae4010dcfce8122018d1cc96d77`
- Working branch: `codex/reddit-oauth-hint-safety`

## Target slice IDs

- `EDITOR-QUALIFICATION-1`
- `APP-EXPANSION-1`

## Outcome

Reddit OAuth client secrets must not produce credential identification hints, consistent with the existing OAuth-credential exclusion. Existing non-OAuth allowlisted token hints remain available.

## In scope

- Remove Reddit app client-secret hints from credential summaries.
- Verify OAuth client secrets are excluded, and ensure existing allowed hints are preserved.
- Record the specific finding, evidence, release status and limits.

## Explicitly out of scope

- Provider API or OAuth behavior, saved credentials, database changes, secret rotation, deployments, and changing hints for already-approved non-OAuth fields.

## Acceptance criteria

- [ ] A long opaque Reddit app client secret never appears, even partially, in summary hints.
- [ ] Trello allowlisted token hints retain the approved fixed mask and two-character suffix.
- [ ] Scope checks, focused tests and the repository verify gate pass before a local commit.

## Safety boundaries

- Use synthetic test credentials only; never print or commit real credentials.
- Do not deploy, push, or alter production credentials as part of this task.
- Keep the user's local web/API running and use an isolated test database and Redis for the final verify.
