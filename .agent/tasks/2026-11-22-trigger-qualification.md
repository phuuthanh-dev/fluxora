# Task contract

## Identity

- Task ID: `2026-11-22-trigger-qualification`
- Base commit: `8a7be1a210adc5176224f152cbfad449eeae84e4`
- Working branch: `codex/trigger-visibility-shopify`
- Implementer: Codex
- Reviewer: PR quality gate and owner

## Outcome

Qualify the Airtable production trigger with authorized sample data, make trigger errors easier to notice, and verify available Shopify workflows without unnecessary expansion.

## Target slice IDs

- `APP-EXPANSION-1`
- `EDITOR-QUALIFICATION-1`

## In scope

- Production Airtable sample creation and update in the previously authorized test base, then deactivate the test workflow.
- Reuse existing trigger status data and interface conventions to expose errors without creating parallel alert infrastructure.
- Qualify Shopify credentials and workflows on the authorized development store when possible; document independent-merchant limitations.
- Compare Airtable optional features to n8n and implement only if justified by current needs; audit affected UI directly.

## Explicitly out of scope

- New apps, Google/Vercel/Supabase work, shared Shopify OAuth, payments, unrelated data and unapproved product copy.

## Acceptance criteria

- Production Airtable sample events and scheduler behavior are verified, or a concrete limitation is reported.
- Trigger status remains workspace-scoped, avoids false positives and surfaces useful errors using existing wording.
- Shopify validation and Airtable enhancement decisions distinguish live evidence from mocks and unverified cases.
- Targeted checks and real UI audit pass, followed by final verification, one PR and merge after CI.

## Required evidence

- Provider test records, targeted automated checks, desktop/mobile and light/dark visual review, typecheck and full release gate.
- `agent:state`, `agent:task:check`, and codegraph regeneration for import changes.

## Safety boundaries

- Preserve unrelated user changes and existing credentials, workflows, payment settings and data.
- Use only the previously approved test base and test store; do not use customer data or create new credentials.
