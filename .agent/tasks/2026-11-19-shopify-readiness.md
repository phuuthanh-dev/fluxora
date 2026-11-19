# Task contract

## Identity
- Task ID: `2026-11-19-shopify-readiness`
- Base commit: `c141a9f06de2f7e6c6192f75e6910b5d55356ae7`
- Working branch: `codex/shopify-store-readiness`
- Implementer: Codex
- Reviewer: Codex

## Outcome
Make existing Shopify connections, webhook ingress and bounded product operations easier and safer for real store owners.

## Target slice IDs
- `APP-EXPANSION-1`
- `EDITOR-QUALIFICATION-1`

## In scope
- Qualify independently owned store if available and authorized; record limitations otherwise.
- Improve Shopify setup/error UX and audit existing webhook delivery semantics.
- Extend existing Shopify product fields based on Shopify documentation and approved UI text.
- Visual UI audit, final verify, single PR and merge.

## Explicitly out of scope
- New apps, Google, Vercel, Supabase, shared Shopify OAuth and App Store payment.
- Unapproved external writes, secrets disclosure and unrelated changes.

## Acceptance criteria
- [ ] Shopify setup errors and existing delivery guards are tested without exposing secrets.
- [ ] Extended product fields retain existing workflow compatibility and safe write semantics.
- [ ] UI inspected directly at desktop/mobile sizes in light/dark themes.
- [ ] External qualification limitations, test results and release state are recorded accurately.

## Required evidence
- Tests: connector validation, GraphQL payloads and signed webhook boundaries.
- Commands: task/state checks, targeted verification and final quality gate.
- UI/manual proof: affected setup and node inspector, light/dark and desktop/mobile.

## Safety boundaries
- Preserve user changes and production data. External destructive actions need explicit authorization.
- No secrets in logs, fixtures, documents or chat.
