# Agent Operating Guide

This repository builds an open-source workflow-automation platform for personal use first, with an architecture that can grow to small teams.

## Mandatory reading order

Before planning, coding, reviewing, or changing dependencies, read these files in order:

1. `docs/01-product-spec.md`
2. `docs/02-architecture.md`
3. `docs/03-development-rules.md`
4. `docs/04-roadmap.md`
5. `docs/05-implementation-plan.md`
6. `docs/06-loop-engineering.md`
7. `docs/10-agent-harness.md`
8. `docs/11-code-graph.md`
9. This file

If a request conflicts with the specification, call out the conflict and propose an explicit spec update before implementing a materially different behavior.

## Non-negotiable product rules

- The workflow runner is server-side. Browsers never execute credentials or third-party actions.
- A published workflow version is immutable; executions always point to the version they ran.
- Credentials and raw secrets must never be returned to the browser, logged, committed, or placed in fixtures.
- Every action node has structured input, output, timeout, retry, and failure behavior.
- Every integration is an adapter behind the node-executor contract.
- Prefer the MVP scope in `docs/01-product-spec.md`; do not casually introduce loops, code execution, RBAC, or unsupported connectors.

## Working conventions

- Use TypeScript everywhere and preserve strict type checking.
- Validate untrusted payloads at API and node boundaries.
- Keep modules small and cohesive; favor composition over a generic `utils` directory.
- Update the relevant specification/architecture document when a product or architectural decision changes.
- Add or update tests for runner semantics, credentials, and connector behavior.
- For source-import changes, run `npm run codegraph:generate`; `npm run verify` rejects a stale graph.
- Use `.agent/task-template.md` and `.agent/report-template.md` for an agent-to-agent handoff. Treat reports as pointers to evidence, never as evidence itself.
- Before handing work off, run the narrowest useful validation, then `npm run typecheck` when feasible.

## Source of truth and documentation

- Product behavior: `docs/01-product-spec.md`
- Technical boundaries: `docs/02-architecture.md`
- Code style and quality gates: `docs/03-development-rules.md`
- Scope sequencing: `docs/04-roadmap.md`
- Current delivery sequence: `docs/05-implementation-plan.md`
- User-facing setup: `README.md`
