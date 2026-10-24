# Agent Collaboration Harness

## Purpose

This repository treats an AI coding agent as an **implementer**, not an authority. The harness makes work auditable, bounded, and inexpensive by keeping durable context in the repository rather than repeatedly pasting it into chats.

The source of truth is, in order: product specification, architecture, code graph, task contract, commit diff, automated checks, and only then the agent handoff report. A report is a navigation aid, not proof.

## Roles

| Role | Owns | Must not decide alone |
|---|---|---|
| Planner/reviewer (Codex) | Requirements, task scope, architecture, security review, acceptance decision | Trusting a self-reported test result, merging without evidence |
| Implementer (for example Antigravity) | One task contract, tests, focused commit, factual report | Changing scope, using secrets, deploying, merging |
| CI | Repeatable build and automated tests | Product/architecture decisions |
| Human owner | Credentials, external side effects, merge and release approval | — |

## Cost-aware delivery loop

1. **Plan once, save it.** The planner creates one `.agent/task-*.md` from the task template and points to existing docs instead of pasting repository context repeatedly.
2. **Implement one vertical slice.** The implementer works in an isolated branch/worktree and commits only the contract scope.
3. **Generate factual evidence.** The implementer runs the specified commands, updates the code graph if source imports change, and fills `.agent/report-template.md`.
4. **Verify mechanically.** Run `npm run harness:check`, then the narrow tests, then `npm run verify` before merge. CI repeats the quality gate.
5. **Review artifacts, not prose.** The reviewer reads the task contract, `git diff <base>...<commit>`, test receipts, and CI. For high-risk changes, the reviewer reruns the critical checks independently.
6. **Feed back by contract.** A failed criterion becomes a concise new task or review comment; it does not become an open-ended agent conversation.

## Model allocation

- Use a low-cost/fast model for mechanical implementation, narrow UI work, fixtures, and clearly specified tests.
- Use a stronger reasoning model for architecture, security boundaries, migrations, concurrency, non-deterministic failures, and review.
- Choose based on task risk, not agent brand. Tests and CI remain the final proof regardless of model.

## Required artifacts

- `.agent/task-template.md`: a bounded task contract.
- `.agent/report-template.md`: a short factual handoff.
- `docs/11-code-graph.json`: generated internal-import graph.
- `docs/11-code-graph.md`: human ownership and traversal guide.

Validate a report with:

```bash
npm run harness:report -- path/to/report.md
```

The command validates format only; it cannot prove the agent's claims.

## Automation boundary

Manual handoff is the default. Automate only after the loop is reliable:

```text
task contract → agent branch/commit → report → CI → reviewer decision → human merge
```

Future automation may use an agent API, GitHub pull-request events, and a task queue. It must preserve branch isolation, command allowlists, budget caps, no-secret logging, CI as an independent gate, and human approval for merge/deploy/external provider actions.

Never give an implementation agent production credentials, a broad shell on a production host, or authority to change CI secrets. Do not let two agents revise the same working tree concurrently.
