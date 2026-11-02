# Parallel node-expansion audit report

## Outcome

- Status: complete (audit and documentation only).
- Result: complete app inventory and evidence-backed n8n comparison with
  architectural findings, UI/auth/discovery constraints and an ordered backlog
  in `docs/37-node-expansion-audit.md`. No connector implementation is claimed.

## Commit and scope

- Base: `04d67b60ed257304ca9aaeaa8dbe4e3969faa4db` (PR #73).
- Branch: `codex/node-expansion-audit` (local only).
- Source changes: none. Existing generated `apps/web/next-env.d.ts` is preserved
  and excluded from this task.
- Scope respected: yes. No secrets, user records or provider APIs inspected;
  no live qualification, PR or deployment performed by the audit workers.
- Local web/API were found stopped and restarted for the owner's ongoing
  preview request. Scheduler disabled only in the process environment
  (`SCHEDULER_ENABLED=false`) to avoid unsolicited scheduled provider calls;
  no `.env` change or migration. No worker process was started.

## Parallel assignments and review

| Auditor | Assignment | Result |
|---|---|---|
| Huygens | Drive, Sheets, Gmail, Calendar, Chat | Read-only code + primary n8n/provider references |
| Carson | SMTP, Discord, Telegram, Steam, Trello, Notion | Read-only code + native/community distinctions |
| Halley | GitHub, MongoDB, PostgreSQL, Supabase, Sentry, Vercel, Reddit, RSS, Kuma | Read-only code + provider/access constraints |
| Coordinator | Shared contracts/runtime/discovery, HTTP, Gemini/OpenAI, Meta/Instagram | Inventory, critical finding review, synthesis and docs |

Workers inherited the session model; no model override or full-history fork.
Common prompt required actual operations, n8n primary links, source pointers,
useful gaps, auth/UX/pagination/retry/trigger constraints, complexity and explicit
unknowns. No writes, tests, installs, credential inspection, live calls or
recursive delegation. All three workers were closed after reporting.

Coordinator independently inspected the catalog AST and executable contracts;
retry OR behavior and Chat adapter status handling; SMTP accepted-result omission;
HTTP/Drive/Sheets readers; Notion cursor omission; PostgreSQL runtime filter
omission; OAuth fixed-label upserts; node version/data semantics; and the n8n
bundle manifest at `86d52c32e42602f2df9eeb3ce8d6a0ab992df92c`.
Native Vercel/Kuma/Steam absence is scoped to that bundle; community verification
is not inferred. Existing later live evidence supersedes earlier failures.

The spec's stale claim that all MongoDB SRV discovery is unsupported was corrected
to guarded SRV seed support, consistent with current code and its own earlier
scope paragraph. This is documentation reconciliation, not a new capability.

## Acceptance criteria

| Criterion | Evidence | Status |
|---|---|---|
| Every catalog app covered | AST/report comparison passed: 25 unique app IDs, 46 catalog types / 44 executable | complete |
| n8n comparison uses primary sources | Per-app direct links, pinned native manifest, dated snapshot | complete |
| Architecture and UX gaps separated from delivered work | docs/37 sections 4–6; existing library/CRUD preserved | complete |
| No duplicate implementation goal | APP-EXPANSION-1 description corrected; NX checklist is proposed work | complete |
| No runtime changes/live calls | Only the six documented Markdown files belong to this audit; existing next-env diff excluded | complete |

## Final validation receipts

| Command / check | Result | Evidence |
|---|---|---|
| Catalog/contract/report coverage and local links | pass | 25 unique rows; catalog/contract sets match, 46/44/2; local report links resolve |
| `npm run agent:state` | pass | 85 completed ledger slices, 11 approved follow-ups; no new implementation marked complete |
| `npm run agent:task:check -- .agent/tasks/2026-11-02-node-expansion-audit.md` | pass | APP-EXPANSION-1 and EDITOR-QUALIFICATION-1 |
| `npm run codegraph:check` | pass | No import/source changes |
| `git diff --check` | pass | Final whitespace check |
| Local web/API health | pass | Dashboard, API health and readiness HTTP 200; scheduler off in local process only |
| `npm run verify` | not run | Documentation-only audit; no runtime implementation |

## Files changed

- `docs/37-node-expansion-audit.md`
- `docs/19-agent-state.md`
- `docs/04-roadmap.md` (pointer to current expansion evidence)
- `docs/01-product-spec.md` (MongoDB SRV documentation correction only)
- `.agent/tasks/2026-11-02-node-expansion-audit.md`
- This report.

## Limits

This is static source and documentation analysis, not an n8n installation test,
load test, production stability claim or new live qualification. Potential
duplicate deliveries were not reproduced. Provider permissions/account state
were not rechecked. Items such as batch execution, media/binary lifecycle,
Meta/Instagram and Reddit migration require separate product/provider decisions.
The next useful implementation batch is NX-01; the audit goal does not authorize
silently implementing every missing n8n operation.
