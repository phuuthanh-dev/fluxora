# Gmail candidate review — 2026-11-03

Scope: source review of the local NX branch. This is not a runtime, provider,
production, or security certification. No real Gmail requests were made.

## Integrated path

- The editor registers list and get-message actions. The get-message adapter
  calls `gmailOperations(...).getMessage` with the selected workspace and
  credential. Existing list graphs use the old type; pagination requires the
  explicit new type. Verification is still outstanding.
- Google scopes returned by Google are bound to the access token; Gmail
  capabilities are restricted to the choices bound to the refresh token.
  Legacy credentials without authenticated scope evidence can use the prior
  read path but cannot establish new scope-gated Gmail write permissions.
- The label picker requires workspace ownership. Review found that its
  provider-controlled names and IDs were returned without token redaction;
  local source now redacts before truncation and rejects token-bearing IDs.
  The accompanying synthetic test has not been run.

## Integration status

`gmail-operations.ts` includes draft creation/update, send/reply and label
changes. Send, reply, create/replace draft and change message label have since
been registered as local draft nodes; label rename remains unregistered.
The draft selector reads a maximum of ten metadata records per page, falls
back to IDs if details are unavailable and supports manual/expression input.
Replacing a draft replaces the entire message, including attachments. These
changes are not verified or released. The adapter
rejects redirects and ambiguous write outcomes without automatic retry, yet
that alone does not establish safe crash recovery or approval-continuation
behavior in the execution engine. Draft-send-by-ID is deliberately disabled.

Before release, verify persisted attempt ownership and
recovery across worker termination and approval continuation, ensure the UI
warns about repeat execution, and show which explicitly selected permission is
needed. Provider acceptance is not proof of inbox delivery. OAuth scopes and
app verification must be reconciled before any production availability claim.
The supported scope alternatives for send and label creation match the
[Gmail send reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
and [label create reference](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels/create).

## Cross-version release gate

The new refresh serialization depends on advisory-lock cooperation. Existing
API and worker versions do not use the same protocol, while the current deploy
script starts replacement services without proving all old refresh-capable
processes have stopped. Do not release this branch until a coordinated,
rehearsed deployment and rollback plan accounts for both versions, in-flight
requests and scheduled work. A passing build alone does not prove that property.
