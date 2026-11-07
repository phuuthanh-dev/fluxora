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

1. **Check state first.** Run `npm run agent:state` when selecting a goal; compare the request with `docs/19-agent-state.md`, source and release evidence to avoid repeating completed work.
2. **Keep the plan proportional.** Use a task contract when work is delegated or its complexity needs a durable handoff; an ordinary direct task does not require a separate task file.
3. **Validate any contract.** If using one, run `npm run agent:task:check -- path/to/task.md` before implementation. Reopening a completed slice requires concrete evidence.
4. **Implement the approved scope.** Work directly by default. Reuse a stable checkout; use a separate worktree only when concurrent work or a genuine isolation requirement needs one. Commit only the approved scope.
5. **Generate factual evidence.** Run the specified commands and update the code graph if source imports change. A delegated handoff uses `.agent/report-template.md`; direct work can report evidence in the ordinary task response.
6. **Verify the completed batch.** Choose checks for the actual changes and run the full gate before a product release. Avoid repeated per-slice gates unless a failure, new change or risk makes them necessary. Docs-only changes follow the CI scope rules.
7. **Review artifacts, not prose.** The reviewer reads the task contract, `git diff <base>...<commit>`, test receipts, and CI. For high-risk changes, the reviewer reruns the critical checks independently.
8. **Feed back by contract.** A failed criterion becomes a concise new task or review comment; it does not become an open-ended agent conversation.

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
