# Task contract

## Identity
- Task ID: `2026-11-01-email-connection-ux`
- Base commit: `3316e45`
- Working branch: `codex/gmail-connector`
- Implementer: Codex
- Reviewer: user

## Outcome
Make Gmail and SMTP discoverable under Email, without changing credential or node semantics.

## Target slice IDs
- `EMAIL-UX-1`

## In scope
- Connection provider selector and focused browser verification.

## Explicitly out of scope
- Credential migration, external mailbox access, production changes.

## Acceptance criteria
- [ ] Users can choose Email then Gmail API or SMTP and see the correct fields.
- [ ] Existing SMTP and Gmail credentials and nodes remain compatible.

## Required evidence
- Tests to add or update: existing SMTP interaction and Gmail choice.
- Commands to run: task check, typecheck, appropriate Playwright and final verify.
- UI/manual proof: exercise both connection variants without saving credentials.
