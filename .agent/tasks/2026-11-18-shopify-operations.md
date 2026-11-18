# Task contract

## Identity
- Task ID: `2026-11-18-shopify-operations`
- Base commit: `4b1c906cfe57f47f033b1c90bed46b6ee4f9322e`
- Working branch: `codex/shopify-practical-operations`
- Implementer: Codex
- Reviewer: Codex

## Outcome
Repair the local environment, qualify Shopify with authorized test resources, and extend practical Shopify functionality with a clear, usable editor.

## Target slice IDs
- `APP-EXPANSION-1`

## In scope
- Inspect and apply pending local migrations without deleting data; keep local scheduler disabled.
- Validate production Shopify using the owner's test store and workspace, and audit affected UI visually.
- Compare n8n and Shopify documentation; add feasible Shopify order/product operations without duplicating existing nodes.

## Explicitly out of scope
- Google, Vercel, Supabase, shared Shopify OAuth, App Store registration and unrelated data or integrations.

## Acceptance criteria
- [x] Local services work with current schema and scheduler disabled, preserving existing data.
- [x] Production test-store connection and supported reads are verified or limitations stated.
- [x] Shopify operations are bounded, preserve safe execution and have usable configuration.
- [x] UI audited visually on desktop and mobile in both themes where available.
- [ ] One final audit and verification completed, then PR created and merged.

## Required evidence
- Tests for connector/runtime behavior and appropriate UI interactions; typecheck and project verification at end.
- Official Shopify and n8n references, and actual provider test result with its limits.

## Safety boundaries
- Preserve user edits, existing secrets, production data, payment services and workflows.
- Only use designated Shopify test resources; no writes to real stores or irreversible deletions.
- Customer-facing copy requires owner approval as stated in AGENTS.md.
