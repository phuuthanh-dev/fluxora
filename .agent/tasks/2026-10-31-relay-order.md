# Task contract

## Identity
- Task ID: `2026-10-31-relay-order`
- Base commit: `3b3ce18`
- Working branch: `codex/landing-relay-p0`
- Implementer: Codex
- Reviewer: project owner

## Outcome
Align the three feature illustrations and their motion with the supplied Relay reference while retaining accurate Fluxora content.

## Target slice IDs
- `L12.3`

## Reopen justification
The owner explicitly requested the documented remaining fidelity gaps be addressed: the current trigger/approval/trace order and fourth chart section differ from the supplied Relay trace/approval/chart sequence; animation is one-shot rather than viewport-scoped looping.

## In scope
- Feature row order, scroll animation, responsive styling, and comparison evidence.

## Explicitly out of scope
- Fictional prices, claims, provider calls, or changes to workflow execution.

## Acceptance criteria
- [ ] Trace, approval, chart appear in Relay order before the statement.
- [ ] Decorative motion plays only while visible and respects pause and reduced motion.
- [ ] Content remains readable without JavaScript; responsive layouts and chart assets work.

## Required evidence
- Targeted Playwright, typecheck, codegraph, and full verification.
- Compare supplied video/spec; document remaining parity limitations.

## Safety boundaries
- Do not use real credentials, deploy, or publish.
