# Task contract

## Identity

- Task ID: `2026-10-27-fix-buildkit-cache`
- Base commit: `8608aa86a27338d71e63845d8f82c262e993cf2e`
- Working branch: `codex/fix-buildkit-cache`
- Implementer: `Codex`
- Reviewer: `Codex + GitHub Actions`

## Outcome

Make staging and production Docker builds compatible with the configured GitHub Actions cache backend.

## In scope

- Initialize Docker Buildx with a pinned official action before build/push.
- Extend deployment contract coverage for the Buildx requirement.
- Run the local gate and confirm the hosted staging build passes.

## Explicitly out of scope

- Application runtime changes, provider calls, VPS deployment, or credential changes.
- Changing image tags, retention policy, or cache scopes.

## Acceptance criteria

- [ ] Staging and production create a non-default Buildx builder before using `type=gha` cache.
- [ ] Deployment contract tests and full local verification pass.
- [ ] GitHub staging build completes through image push.

## Required evidence

- Tests: `npm run deployment:check`, `npm run verify`.
- Hosted evidence: staging workflow run for the merged fix.

## Safety boundaries

- Do not use or print real provider credentials.
- Do not deploy to the VPS while validating the build fix.
