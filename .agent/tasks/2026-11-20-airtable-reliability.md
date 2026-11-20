# Task contract

## Identity

- Task ID: `2026-11-20-airtable-reliability`
- Base commit: `5468ede5bb1a7374d723d2c28325056b27dc4023`
- Working branch: `codex/airtable-trigger-reliability`
- Implementer: Codex
- Reviewer: PR quality gate and owner

## Outcome

Qualify Shopify where feasible, improve existing execution and billing safety, and add an Airtable record trigger with bounded reliable polling.

## Target slice IDs

- `APP-EXPANSION-1`
- `EDITOR-QUALIFICATION-1`
- `PLAN-USAGE-1`

## In scope

- Preserve independently-owned merchant qualification as open unless actual evidence exists.
- Improve existing retry/error and payment operational paths only where audit finds a concrete gap.
- Add Airtable trigger with existing connection and durable checkpoint mechanism.
- Compare official provider and n8n documentation; visually inspect affected UI.

## Explicitly out of scope

- Google, Vercel, Supabase, new apps, shared Shopify OAuth, customer cancellation, new charges and unapproved customer copy.

## Acceptance criteria

- [ ] Shopify evidence and limits accurately documented.
- [ ] Execution and payment changes retain safe uncertain-write/manual reconciliation behavior.
- [ ] Airtable polling has explicit baseline, safe checkpointing and bounded behavior.
- [ ] Affected UI visually checked, tests and release gates pass, one PR merged.

## Required evidence

- Targeted tests for runtime, provider parsing, race and failure boundaries.
- `npm run agent:state`, `npm run agent:task:check -- .agent/tasks/2026-11-20-airtable-reliability.md`, appropriate final verification and codegraph if imports change.
- Desktop/mobile UI in both themes when available.

## Safety boundaries

- Preserve existing user changes, stored data, credentials, payOS and PayPal.
- Do not initiate real payments or destructive external writes.
