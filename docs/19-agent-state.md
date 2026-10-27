# Agent Current State Gate

This file is the compact, machine-checked handoff point for the next coding
loop. It prevents an agent from proposing implementation work that is already
complete in the delivery ledger.

## How to use it

Before planning or proposing a goal, run:

```bash
npm run agent:state
```

Before handing a new task to an implementer, add the target IDs to the task
contract and run:

```bash
npm run agent:task:check -- .agent/tasks/<task>.md
```

The completed L0–L11.4 rows in `docs/06-loop-engineering.md` are closed for
new implementation. Reopening one requires an explicit `## Reopen
justification` section in the task contract with a concrete regression,
security finding, or changed requirement.

## Last audited repository state

| Field | Value |
|---|---|
| Audited main commit | `086fc7356ca45c098874deecd587fe3f207d8130` |
| Release PR | `#27` — merged |
| Quality gate | Passed on current branch: 127 API, 18 web, 29 Playwright; 0 failed, 0 skipped |
| Source tree | Current branch contains committed `UX-1` slice `b936a55` on top of the audited release candidate |
| Uncommitted source changes | None after focused commit |

## Next approved slices

These are the only currently approved follow-up directions. A task must target
one of these IDs or explicitly reopen a completed ledger slice.

| ID | Outcome | Status | Owner/evidence boundary |
|---|---|---|---|
| `OPS-1` | Complete the VPS production qualification evidence: DNS/TLS, env shape, backup/isolated restore, rollback, and fixed-target smoke | operator-gated | Requires operator access and must not print secrets |
| `LIVE-1` | Validate one explicitly approved real Steam → Google Chat run plus configured OAuth callbacks | owner-input-required | Requires user credentials and explicit external-side-effect approval |
| `UX-2` | Improve dense-canvas navigation/minimap without changing workflow semantics | planned | Must preserve keyboard, zoom, theme, and reduced-motion coverage |
| `OPS-2` | Add saved execution triage views and retention visibility | planned | Must not expose secrets or provider URLs |
| `P2-1` | Implement the next production-backed connector only after live qualification | deferred | Requires an explicit product choice; candidates are Email, OpenAI/Gemini, MongoDB, or GitHub runtime |

## Closed boundary

The following are not next implementation goals because they are already
implemented and verified in the repository ledger: authentication and identity
readiness, workspace/dashboard/workflow lifecycle, editor and node library,
credential lifecycle and dependency references, execution engine and worker qualification, node debug,
Go Live/activation guards, execution center, notification adapters, theme and
Relay-inspired design system, accessibility hardening, CI/CD, immutable image
deployment, release security contracts, and production release candidate
documentation.

## Non-negotiable loop

```text
read this state → select one non-closed ID → define proof
→ implement one vertical slice → run agent:task:check
→ run npm run verify → review diff and CI → merge only with owner approval
```

If no item can proceed without credentials, operator evidence, or a product
choice, report that blocker instead of inventing another feature or repeating a
completed slice.
