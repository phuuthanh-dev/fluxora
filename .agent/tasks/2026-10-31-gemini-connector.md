# Gemini text connector — implementation contract

## Target slice IDs

`AI-GEMINI-1`

## Objective

Deliver the owner's requested Gemini connector before OpenAI, without enabling
the node until its credential, picker, runtime and UI form one complete path.
Google Drive/Sheets and other existing integrations remain separate live
qualification work; never use provider secrets as test fixtures.

## Acceptance

- Workspace-owned, encrypted Gemini API-key credential with owner isolation,
  replacement, reference checks and redaction; do not reuse Google login OAuth.
- Searchable, bounded, owner-scoped server-side model discovery with explicit
  loading/empty/error states and a manual/expression fallback; retain the stable
  model identifier, not only a label.
- Generate-text operation with typed prompt, output limit and timeout; mock
  execution must not call a provider. Live execution must retain the existing
  publish/confirmation gate and retry/error behavior.
- Return a normalized text result with no key, request header or provider error
  body. Respect output and persistence redaction, timeout and size limits.
- Document field behavior, credential contract, mock, retry semantics, live
  qualification boundary and migration impact; keep OpenAI separately scoped.
- Cover owner isolation, credential lifecycle, model discovery, mock/live
  dispatch, failures and UI using synthetic fixtures; run `npm run verify`.

## Provider documentation consulted

- https://ai.google.dev/api/generate-content
- https://ai.google.dev/api/models
- https://ai.google.dev/gemini-api/docs/generate-content/api-key

## Current progress

The local implementation now wires the Gemini API-key provider, authenticated
bounded model discovery, editor fields, execution and readiness. An additive
PostgreSQL enum migration is included but has not been applied to production.
Focused synthetic tests passed. The final full verify passed after OpenAI was
added (239 API, 25 web and 122 Playwright tests); see
`.agent/reports/2026-10-31-gemini-local.md`. This does not establish a
real-provider qualification. A separate Google Drive live qualification was
performed through the OAuth connection already stored in Fluxora; see
`.agent/reports/2026-10-31-google-drive-live.md`. No Gemini live provider run
has been performed.
