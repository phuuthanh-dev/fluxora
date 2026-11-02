# Workspace sidebar and delivery review — 2026-11-02

## Reference and scope

The owner's 5.8-second sidebar video shows a floating glass rail, icon-only
compact mode, hover labels, grouped navigation, expandable labels and a bottom
account control. Fluxora adopts those interactions and proportions with its
existing lime/semantic colors and Gilroy typography. The video background and
unimplemented Wallet/Chat destinations are not product requirements.

Dashboard, Connections, Executions and Account settings share
`features/app-shell/workspace-sidebar.tsx`. The editor retains its toolbar,
horizontal app header and unsaved-change guard. Search filters actual pages;
it is not a workflow/content search and does not call a provider.

## Behavior and ownership

- Expanded rail: 248px; compact rail: 76px; inset: 16px. Content reflows using
  one CSS variable. The workspace selector remains visible above content.
- Workspace ID is carried between management routes. Active destinations use
  `aria-current`; icons have accessible names and focus/hover labels.
- The browser-local collapse preference is optional. Storage failures never
  prevent navigation; initial restoration does not animate. Interaction uses
  the shared 280ms GSAP timing with cancellation and reduced-motion support.
- At 900px and below, a labelled menu button opens a shared Dialog drawer.
  Escape/backdrop/navigation dismiss it; keyboard focus stays inside and
  returns to the opener on dismissal.
- Account actions retain the existing auth behavior; the sidebar popup opens
  upward with bounded height. The editor account popup still opens downward.
- `product-shell.css` owns composition; semantic tokens own theme colors;
  `components/ui/ui-motion.ts` owns the reusable rail transition.
- Add future actual destinations to the descriptor list, rather than copying
  menus across routes. Do not add fake links to make the sidebar look full.

Functional checks do not establish exact visual parity with the reference.
The owner reviews the Fluxora adaptation on localhost.

## Reddit: code is not access approval

Fluxora has a Reddit connector with mock coverage; no successful live Reddit
request or provider approval is recorded. PR #65 already added the provider
access notice. Do not repeat that implementation or claim an application was
submitted/rejected without evidence.

Reddit's [October 8 changelog](https://support.reddithelp.com/hc/en-us/articles/54353370049684-Changelog-October-8-2026)
states that new Public Data API access requests stopped on October 31, 2026;
remaining public access is scheduled to end in March 2027. Reddit RSS support
ends November 13, 2026, so it is not a durable fallback. The
[n8n credential guide](https://docs.n8n.io/integrations/builtin/credentials/reddit)
also requires manual pre-approval before client credentials can be created;
its older instructions do not override Reddit's newer cutoff.

Keep Reddit explicitly unqualified for live use. If an already approved app
exists, assess its registered migration eligibility. Otherwise evaluate
Reddit Developer Platform support for a concrete use case before committing
to a Devvit replacement; it is not automatically an external generic API.

## Parallel-agent feasibility

Recommendation, not an activated automation: one coordinator plus at most two
bounded implementation agents. Follow `10-agent-harness.md` and current state;
do not invent new unfinished work from old chat history.

| Role | Suitable responsibility | Boundary |
|---|---|---|
| Coordinator/reviewer | Contract, interfaces, integration, final review/release | Own shared tokens, package lock, migrations and state ledger |
| UI implementer | One route/feature and its browser cases | Own assigned web paths in a separate worktree |
| Connector implementer | One independent provider adapter, schema and tests | Own assigned API/contracts paths in a separate worktree; no production credentials |

For inexpensive narrow changes use an available fast model with an exact file
scope; use a stronger reasoning model for auth, execution semantics and review.
Confirm the installed model names before configuring them. No model config or
new background agent is enabled by this document.

Example delegation contract:

> Read the task contract and current state. Implement only the assigned scope
> in your isolated worktree. Preserve shared interfaces; report conflicts to
> the coordinator. Do not push, deploy, use live credentials or run the complete
> suite. Return commit, files, behavior changes, test additions and limitations.
> The coordinator waits for all work, reviews diffs, integrates once, runs the
> final verify, then releases one develop-to-main PR under owner authorization.

Parallel work can reduce elapsed time, but subagents consume more tokens and
shared-file changes require coordination. Start with independent read-only
audits or independent connectors; this tightly coupled sidebar change is
implemented by one agent. See [official subagent guidance](https://developers.openai.com/codex/multi-agent/).
