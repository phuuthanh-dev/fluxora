# Task contract

## Identity

- Task ID: `2026-10-27-name-ci-build-steps`
- Base commit: `569264c7266fc1ac30fdf81e72836fb03a66ce84`
- Outcome: make CI/CD logs clearly distinguish API and Web image builds.

## In scope

- Name the staging and production build/deploy jobs.
- Name Buildx, API image, and Web image steps.
- Add a deployment contract assertion for the two image labels.

## Out of scope

- Changing build order, image tags, cache scopes, credentials, or deployment behavior.

## Acceptance criteria

- [ ] GitHub Actions displays distinct API and Web build steps.
- [ ] Deployment contract and full quality gate pass.

## Safety boundaries

- Do not use or print provider credentials.
- Do not manually deploy to the VPS.
