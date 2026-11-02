# Parallel app/node expansion audit

## Identity
- Task ID: `2026-11-02-node-expansion-audit`
- Base: `04d67b60ed257304ca9aaeaa8dbe4e3969faa4db` (PR #73 merged).
- Local branch: `codex/node-expansion-audit`.
- Owner explicitly requested parallel agents and a goal for this audit.

## Target slice IDs
- `APP-EXPANSION-1`
- `EDITOR-QUALIFICATION-1`

## Outcome
An evidence-backed inventory of every current app/operation, comparison with
official n8n nodes, architectural scalability gaps, field/auth/trigger UX
requirements and a prioritized implementation checklist. This is an audit;
implemented, mock-tested and live-qualified are separate statuses.

## Assignment
All workers are read-only, receive this contract and use the inherited model
without copying conversation history. Only the coordinator writes documents.

1. Google: Drive, Sheets, Gmail, Calendar, Chat.
2. Communication/productivity: SMTP, Discord, Telegram, Steam, Trello, Notion.
3. Data/DevOps: GitHub, MongoDB, PostgreSQL, Supabase, Sentry, Vercel, Reddit,
   RSS, Uptime Kuma.
4. Coordinator: contracts/catalog/executors/discovery, triggers, data mapping,
   pagination/retries/versioning, Gemini/OpenAI and planned Meta/Instagram.

## Required worker output
Compact matrix: actual Fluxora operations (code references), current n8n
native/community/generic route (primary links), useful missing operations,
auth/field/discovery/trigger constraints, complexity S/M/L and priority.
Record unknowns and live-evidence limits. Distinguish a picker from an executable
operation. Recommend only useful parity, not every provider endpoint.

## Boundaries
No code changes, tests, installs, credentials, external provider calls, PRs,
deployment or source commits by workers. No `.env`/DB inspection. Preserve
existing `apps/web/next-env.d.ts`. Do not repeat completed live tests. Do not
claim official n8n support from community nodes or integration marketing pages.

## Completion and final validation
- [x] All catalog apps accounted for, including planned/unavailable entries.
- [x] Primary n8n/provider references with date and local code pointers.
- [x] Architectural risks distinguished from verified bugs and proposals.
- [x] Prioritized checklist with scope, dependencies, acceptance criteria.
- [x] Coordinator reviews worker evidence and resolves inconsistencies.
- [x] Final documentation/state/graph/diff checks; full runtime verify is not
  required for a read-only audit with documentation-only output.
