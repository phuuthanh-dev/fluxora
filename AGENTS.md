# Agent Operating Guide

This repository builds Fluxora, an open-source workflow-automation platform for personal use first, with an architecture that can grow to small teams.

## Scope control — owner directive

- Follow the owner's latest requested outcome and constraints. A later direction that narrows or changes the work overrides an older goal, backlog, specification suggestion, agent report, or automation continuation.
- Before changing code, identify how the change is required for the current request. Carry out necessary implementation details and fixes within that scope; do not invent additional features, settings, compatibility layers, refactors, or architecture work just because an audit or specification mentions them.
- An audit or request to inspect is not authorization to implement every issue discovered. Report out-of-scope findings separately, and obtain an explicit instruction before implementing them. If a scope boundary is genuinely ambiguous, ask rather than silently expanding it.
- Confirm existing implementation and release state before starting work, so completed features are not repeated. Keep unfinished or unrelated local changes intact unless the owner explicitly directs otherwise.
- Respect the owner's requested batch and validation timing. Do not create extra PRs, deploys, or verification loops outside that instruction. Explain any blocker and the actual status without claiming unverified work is complete.

## Workspace hygiene

- Start by checking the actual checkout, branch, Git status and current release; do not repeat completed work from stale notes. Preserve uncommitted changes and do not overwrite or delete an existing checkout.
- Reuse a stable checkout and existing safe local services. Create a worktree or isolated database/container only when needed, record its purpose and ownership, and avoid placing the primary checkout in a temporary directory.
- At the end of the approved batch, inventory resources created for that batch and clean up only when their ownership and safety are established and applicable approval requirements are met. Never prune unknown worktrees, volumes, databases, credentials, workflow data or rollback images.
- Keep one concise current status in `docs/19-agent-state.md`; date historical snapshots. A cleanup suggestion or audit finding does not authorize an unrelated refactor or deletion.

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
9. `docs/19-agent-state.md`
10. This file

If a request conflicts with the specification, call out the conflict and propose an explicit spec update before implementing a materially different behavior.

## Non-negotiable product rules

- The workflow runner is server-side. Browsers never execute credentials or third-party actions.
- A published workflow version is immutable; executions always point to the version they ran.
- Stored credentials, OAuth tokens, and existing secrets must never be returned in full to the browser, logged, committed, or placed in fixtures. The owner explicitly authorized a fixed mask with at most two trailing characters for allowlisted long opaque provider API keys/tokens in authenticated, non-cacheable workspace credential summaries. Passwords, OAuth credentials, webhook URLs, connection strings and short values are excluded. A newly generated webhook signing or header-auth secret may additionally be returned once to its authenticated workspace owner at creation or rotation so it can be configured with the sender; responses must not be cached, and subsequent reads must never return it.
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
- Run `npm run agent:state` before proposing a goal. New task contracts must declare target IDs from `docs/19-agent-state.md`; run `npm run agent:task:check -- <task-file>` before implementation. Never repeat a completed L-slice without a concrete reopen justification.
- Before handing work off, run the narrowest useful validation, then `npm run typecheck` when feasible.
- For UI changes, read `docs/14-design-system.md` and `docs/25-ui-core-unification.md`. Reuse shared tokens, BrandLockup, page headers and controls; verify both themes and the affected overlay/menu states before adding route-specific CSS.

## Source of truth and documentation

### GSAP animation work

- For UI animation changes, read `docs/26-gsap-workflow.md` (and
  `docs/22-public-landing-v2.md` for marketing), then the relevant official skills under
  `.agents/skills/`. Use `gsap-core`, `gsap-react` and `gsap-scrolltrigger` for
  React scroll work; add `gsap-timeline` and `gsap-performance` for choreography
  and optimization. Load plugins/utils/frameworks only when needed.
- Preserve component-scoped cleanup, readable SSR content, pause/reduced-motion
  support and the existing single scroll/render ticker. Validate skill examples
  against installed APIs; do not copy unrelated snippets or expand scope.
- Skills guide implementation; they do not authorize new dependencies, provider
  calls, publishing or deployment. Repository constraints and user scope apply.

- Product behavior: `docs/01-product-spec.md`
- Technical boundaries: `docs/02-architecture.md`
- Code style and quality gates: `docs/03-development-rules.md`
- Scope sequencing: `docs/04-roadmap.md`
- Current delivery sequence: `docs/05-implementation-plan.md`
- User-facing setup: `README.md`
