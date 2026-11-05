# Correct blank Google resource validation

## Identity

- Task ID: `2026-11-06-google-resource-validation`
- Base commit: `cb876ca` (after PR #91)
- Working branch: `codex/google-resource-validation` local
- Implementer and reviewer: Codex

## Target slice IDs

- `APP-EXPANSION-1`

## Outcome and scope

Correct the shared configuration checks for Google Sheets spreadsheet IDs and
ranges, and Google Drive text-download file IDs, which currently accept only
whitespace and report a successful mock run. These are confirmed using a
synthetic local configuration with no credentials or provider calls. Keep
valid ranges containing spaces and runtime expressions usable.

## Explicitly out of scope

- New operations, credentials, provider calls, retry or timeout controls.
- Changes to existing data, workflow records, or the unrelated stopped worktree.
- Rejecting whitespace in free-text file names or spreadsheet content.

## Acceptance criteria

- [x] Blank-only resource IDs and ranges are rejected at static and resolved
  validation, before a mock or live provider operation is attempted.
- [x] Valid literals including quoted sheet names containing spaces remain valid.
- [x] Expressions remain accepted at edit time and are checked after resolution.
- [ ] The final project gate and CI must pass before release.

## Required evidence and safety

Add synthetic validation and mock/live executor cases; no credentials or external
requests. Verify once at the end of the authorized batch. Keep local services
running and scheduler disabled. Do not include unrelated changes.

The two focused API test files passed 27/27 after generating Prisma Client.
The first attempt stopped before running tests because the isolated worktree's
Prisma Client had not yet been generated. Full `npm run verify`, CI, and
release remain pending; no provider request was made.
