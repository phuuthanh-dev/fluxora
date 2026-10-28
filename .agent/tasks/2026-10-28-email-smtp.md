# Task contract

## Identity

- Task ID: `2026-10-28-email-smtp`
- Base commit: `5a307fd04743e2a58cb1610406edf1c3fc5f2527`
- Branch: `codex/email-smtp-connector`
- Implementer: Codex

## Outcome

Ship one focused SMTP Email action: an encrypted workspace connection and a
separate, typed send-email node. It must be usable in mock runs and ready for
owner-approved live SMTP qualification without reusing Google OAuth.

## Target slice IDs

- `EMAIL-SMTP-1`

## Scope and boundaries

- Use SMTP submission only: encrypted host, port, username, password and From
  address; support TLS on 465 and required STARTTLS on 587; reject port 25.
- Keep recipients and message content in node configuration, not credentials.
- Do not implement attachments, inbound email, Gmail OAuth, bulk delivery or
  provider presets in this slice.
- Validate host/port/addresses, avoid provider debug logging, redact secrets,
  and classify permanent versus retryable failures without retaining raw SMTP
  replies.
- Do not send a real email or deploy as evidence without explicit owner input.

## Required evidence

- Unit tests for credential/config validation, mock output, live adapter
  contract, timeout/auth/rejection classification and redaction.
- Catalog and readiness parity tests for the enabled node.
- Prisma migration validation, `npm run agent:task:check`, and `npm run verify`.
- Review the final diff against the connector audit before opening a PR.
