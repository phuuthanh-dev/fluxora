# Multi-trigger qualification, mapping, recovery and Airtable

## Identity

- Task ID: `2026-11-12-mapping-airtable-operations`
- Base commit: `dbaf22262191acad1689080043d2cf1f6a7c1827`
- Working branch: `develop`; single owner checkout
- Implementer/reviewer: Codex

## Outcome

Qualify mixed-trigger behavior; improve existing mapping/debug usability; rehearse full isolated recovery and bounded monitoring; add Airtable record operations using user-owned access.

## Target slice IDs

- `MULTI-TRIGGER-1` — live qualification of the deployed general implementation, not a reimplementation.
- `EDITOR-QUALIFICATION-1` — extend the existing mapper/debug controls, informed by n8n.
- `OPS-1` — isolated app recovery and bounded monitoring, retaining existing backup.
- `APP-EXPANSION-1` — owner-requested Airtable connector with limited record operations and discovery.

## In scope

- Safe real trigger tests against explicitly approved test resources when accessible, with evidence and limitations.
- Minimal improvements to source-field discovery/mapping and debug, reusing current expression engine.
- Isolated application recovery and credential decryption proof without contacting real providers; meaningful health/backup monitoring using existing infrastructure.
- Airtable user-owned authentication, base/table discovery and list/get/create/update records, with scoped validation and safe failure behavior.
- Corresponding product/architecture documentation and visual browser review in both themes.

## Explicitly out of scope

- Existing live workflow edits, messages to other people, arbitrary production-data changes, new infrastructure subscriptions, unnecessary plugin systems, unrelated UI redesign, duplicate existing nodes, and unsupported claims of full n8n parity.

## Acceptance criteria

- [x] Demonstrate or document blocked live mixed-trigger qualification without disturbing owner workflows.
- [x] Existing mapping UI becomes easier to search and select with keyboard and pointer; mock/live distinctions remain clear.
- [x] Isolated recovery proves application startup and credential decryption without provider side effects; monitoring and backup limitations are documented.
- [ ] Airtable connection and list/get/create/update nodes follow server-side credential isolation, bounded requests and safe write retry behavior.
- [ ] Review rendered UI directly, audit once, run final `npm run verify`, and submit one develop-to-main PR and merge after CI.

## Safety boundaries

Preserve existing `apps/web/next-env.d.ts` changes, secrets, unknown data and user workflows. User requested release and provider qualification; no provider message or external subscription is authorized. Never place real credentials in code, tests, logs or chat. Airtable Developer Terms and integration authorization require assessment; do not solicit third-party PATs if prohibited. No production restore against the live database.
