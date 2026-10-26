# Task contract

## Identity

- Task ID: `2026-10-27-fix-scp-action-pin`
- Base commit: `66d2593d76bb3a910e4a92fb6854616f34443ebd`
- Outcome: restore the staging and production deploy jobs after the invalid pinned SCP action reference was detected.

## In scope

- Replace the invalid `appleboy/scp-action` SHA with the verified `v0.1.7` commit.
- Extend deployment contract coverage so the pin cannot silently regress.
- Run the deployment contract and full local verification before merge.

## Out of scope

- Application runtime changes, credentials, VPS configuration, or provider calls.
- Changing deployment behavior beyond correcting the immutable action reference.

## Acceptance criteria

- [ ] Staging and production resolve the pinned SCP action.
- [ ] Local quality gate passes.
- [ ] Post-merge staging reaches the deploy step without action-resolution failure.

## Safety boundaries

- Do not use or print real provider credentials.
- Do not manually deploy to the VPS.
