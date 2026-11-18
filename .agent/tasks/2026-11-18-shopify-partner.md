# Task contract

## Identity
- Task ID: `2026-11-18-shopify-partner`
- Base commit: `5856df9f3c01e2d6cf2cf32e6109b18d1de5adf3`
- Working branch: `develop`
- Implementer: Codex
- Reviewer: Codex

## Outcome
Complete Shopify Partner app configuration and qualify a second development store without disturbing live integrations.

## Target slice IDs
- `APP-EXPANSION-1`

## In scope
- Correct the Shopify app configuration to the authorized Partner app and preserve current callback URLs.
- Document confirmed deployment and test status.

## Explicitly out of scope
- Other integrations, merchant data, unapproved product copy, unrelated user edits and additional payment transactions.

## Acceptance criteria
- [x] The repo app configuration matches the authorized Partner app and retains its intended callbacks and compliance subscriptions.
- [x] Actual production configuration, provider review and second-store test status are accurately documented.

## Required evidence
- Tests to add or update: no new behavior; validate provider configuration and relevant OAuth behavior.
- Commands to run: `npm run agent:task:check -- .agent/tasks/2026-11-18-shopify-partner.md`; focused validation and final gate.
- UI/manual proof: Shopify Dev Dashboard app and current version.

## Safety boundaries
- Do not expose or commit secrets, alter existing merchant webhooks or fabricate review approval. Preserve unrelated local changes.
