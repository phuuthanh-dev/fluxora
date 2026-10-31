# OpenAI text connector — implementation contract

## Target slice IDs

`AI-OPENAI-1`

## Objective

Add a separate workspace-owned OpenAI API-key connection and a text-generation
action using the Responses API, after the Gemini local implementation. Existing
account OAuth credentials must not be reused.

## Acceptance

- Encrypted, owner-scoped connection with reference checks and safe rotation.
- Server-side bounded model discovery and manual/expression fallback; do not
  claim the models list guarantees text-generation compatibility.
- Published live execution with explicit confirmation, bounded input/output,
  timeout and sanitized provider failures; deterministic mock execution does
  not read credentials or call the provider.
- Normalize text across output messages, handle refusal/incomplete responses,
  and avoid extracting reasoning or exposing provider secrets.
- Synthetic tests cover ownership, credential boundaries, UI, runtime and
  errors. Document the schema migration and real-provider qualification gap.

## Official references

- https://developers.openai.com/api/docs/guides/text
- https://developers.openai.com/api/reference/resources/models/methods/list

No real API key or external model request is required for implementation tests.

## Current progress

The local implementation and synthetic test coverage are in place. The final
`npm run verify` passed with exit code 0, including 122 Playwright tests. The
additive credential migration was applied locally only. The owner deferred real
OpenAI provider testing; availability and billing remain unqualified.
