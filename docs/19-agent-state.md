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

The completed L0–L11.5 rows in `docs/06-loop-engineering.md` are closed for
new implementation. Reopening one requires an explicit `## Reopen
justification` section in the task contract with a concrete regression,
security finding, or changed requirement.

## Last audited repository state

| Field | Value |
|---|---|
| Audited main commit | `4ca71df1e694558bcb3505d2ed18b33cbf91d2d3` |
| Release PR | `#27` — merged |
| Quality gate | Passed on current branch: 145 API, 19 web, 29 Playwright; 0 failed, 0 skipped |
| Source tree | Current branch contains the GitHub Create Issue/idempotency, Add Label, Add Comment, Merge Pull Request operations, and the signed GitHub Issue opened trigger |
| Uncommitted source changes | None after implementation commit; handoff state/report updates are recorded separately |

## Next approved slices

These are the only currently approved follow-up directions. A task must target
one of these IDs or explicitly reopen a completed ledger slice.

| ID | Outcome | Status | Owner/evidence boundary |
|---|---|---|---|
| `OPS-1` | Complete the VPS production qualification evidence: DNS/TLS, env shape, backup/isolated restore, rollback, and fixed-target smoke | operator-gated | Requires operator access and must not print secrets |
| `LIVE-1` | Validate one explicitly approved real Steam → Google Chat run plus configured OAuth callbacks | owner-input-required | Requires user credentials and explicit external-side-effect approval |
| `OPS-2` | Add saved execution triage views and retention visibility | planned | Must not expose secrets or provider URLs |
| `P2-1` | Extend the GitHub connector beyond Create Issue with the next approved operation | planned | Create Issue, Add Label, Add Comment, Merge Pull Request, and Issue opened trigger now have separate executable nodes with shared workspace-owned credentials, mock/live transport, readiness, safe error classification, signed raw-body verification, event filtering, and Create Issue idempotency coverage; remaining GitHub triggers and further operations still require an explicit scope choice and owner-approved provider smoke |

## Closed boundary

The following are not next implementation goals because they are already
implemented and verified in the repository ledger: authentication and identity
readiness, workspace/dashboard/workflow lifecycle, editor and node library,
credential lifecycle and dependency references, execution engine and worker qualification, node debug,
Go Live/activation guards, execution center, notification adapters, theme and
Relay-inspired design system, accessibility hardening, CI/CD, immutable image
deployment, release security contracts, production release candidate
documentation, and dense-canvas navigation/minimap.

## Non-negotiable loop

```text
read this state → select one non-closed ID → define proof
→ implement one vertical slice → run agent:task:check
→ run npm run verify → review diff and CI → merge only with owner approval
```

If no item can proceed without credentials, operator evidence, or a product
choice, report that blocker instead of inventing another feature or repeating a
completed slice.
