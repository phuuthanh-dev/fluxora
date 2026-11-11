# Sheets trigger, mapping and execution feedback

## Identity
- Task ID: `2026-11-11-sheets-mapping-debug`
- Base: `474f7a5a6352a09ecd09e6cdc15f2a357c299b59`; branch `develop`.

## Target slice IDs
- `CONNECTOR-LIVE-2`
- `EDITOR-QUALIFICATION-1`
- `APP-EXPANSION-1`
- `NOTION-1`

## Owner-approved scope
1. Qualify existing Notion and Drive polling triggers using dedicated test resources; avoid unrelated workflows and real message delivery.
2. Improve existing mapping UI with clear source values and targeting, preserving the expression engine.
3. Add Google Sheets row-added polling trigger using the existing connection, scheduler and safe baseline semantics. Document row identity and boundary limitations; prevent silent loss on unsafe changes.
4. Improve existing failure/history UX without rebuilding retry.

## Acceptance
- Provider tests use only identifiable approved test data and record real outcomes and limitations; no claim of live qualification from mocks.
- Mapping and execution screens are visually reviewed in both themes; keyboard and narrow states are considered.
- Trigger handles baseline, durable checkpoints, identity, mutation and partial fetch safely; no claim of exactly-once provider effects.
- One final audit and full `npm run verify`, then one PR develop→main, merge when CI passes. Preserve pre-existing `apps/web/next-env.d.ts`.
- Follow existing architecture, task and security boundaries; no unrelated apps, credentials or workflows changed.
