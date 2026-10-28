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
| Local base commit | `6565a3c` (subsequent changes are on `codex/webhook-registration-ux`) |
| Release PR | `#27` — merged |
| Quality gate | See individual slice reports; local verification includes pre-existing, uncommitted CI changes |
| Source tree | Current branch contains the GitHub Create Issue/idempotency, Add Label, Add Comment, Merge Pull Request operations, and the signed GitHub Issue opened, Pull request opened, Push, and Workflow run completed triggers |
| Uncommitted changes | Existing OPS edits are preserved separately; the local CI correction passed verification and still needs GitHub review |

## Closed follow-up slices

- `P2-1` — GitHub connector vertical slices complete locally through the current acceptance boundary: separate encrypted connector credential, mock/live-guarded Create Issue, readiness, retry/error classification, idempotency, Add Label, Add Comment, Merge Pull Request, Issue opened, Pull request opened, Push, and Workflow run completed. No real provider smoke is implied; that remains owner-approved external validation.
- `WEBHOOK-REG-1` — Per-workflow GitHub signing secrets and compact editor guidance implemented locally; `npm run verify` passed (154 API, 19 web, 30 Playwright). Migration has not been applied and real delivery remains unverified.
- `GH-UX-2` — Bounded GitHub repository pagination, manual/expression fallback, and recoverable picker states implemented locally; `npm run verify` passed with 31 Playwright tests. Provider calls in tests were mocked.
- `OPS-2` — Status-based saved views scoped to user/workspace, server-side triage and retention policy visibility implemented locally. Full quality gate passed; both new migrations were applied to an isolated fresh PostgreSQL database and an isolated synthetic upgrade from `6565a3c`. Workflow, date, and mode filters remain future extensions; production migration and live validation are outstanding.
- `GOOGLE-UX-1` — Google Sheets and Drive text-file pickers implemented locally through an owner-scoped server proxy. Full gate passed with mocked providers; real OAuth resource discovery remains unverified.
- `GH-HARDEN-1` — Signed GitHub setup pings are acknowledged without running inactive workflows; repeated deliveries use registration-scoped delivery IDs. Full gate passed with mocked providers. Deduplication is bounded by execution retention and is not replay protection: the delivery header is not covered by the body HMAC.
- `WEBHOOK-VERSION-UX-1` — Registration UI uses the published trigger, warns about endpoints pinned to older versions, and blocks registration for unpublished triggers. Full gate passed with 35 Playwright tests and mocked providers.
- `WEBHOOK-ATOMIC-1` — Registration writes and audit writes share a database transaction; a synthetic PostgreSQL test confirms an audit error rolls back secret rotation. The full gate passed. A lost response after a successful commit can still require another rotation.
- `WEBHOOK-UNCERTAIN-UX-1` — An unsuccessful registration request clears the previously displayed secret, reloads endpoint status, and warns of an uncertain outcome. Playwright simulates a lost response; the full gate passed. This does not recover a lost secret or prove a still-running request has finished.
- `WEBHOOK-CONCURRENCY-1` — Workflow-row locking and observed version checks prevent concurrent app requests from silently creating duplicate registrations or replacing another rotation. Synthetic PostgreSQL and full-gate tests passed. Older clients must reload; the application lock does not constrain direct database writes.
- `WEBHOOK-SECRET-CONTRACT-1` — Owner approved a one-time GitHub signing-secret display; generic webhooks retain the same one-time model after provider comparison. The response is non-cacheable, guidance is aligned, and focused and full-gate tests passed. Existing secrets remain unavailable on later reads.
- `GH-HOOK-AUTO-1` progress — Provider-managed GitHub webhook status/create/delete are now exposed through an owner-scoped API and the editor panel. Mutations are feature-flagged, require `PUBLIC_API_ORIGIN` in production, use only the workspace GitHub credential, and return no token, signing secret, callback URL or remote hook ID. Automatic re-registration is allowed only after a definitive rejected/removed result; uncertain outcomes remain blocked. Full live-provider qualification and reconciliation UX are still open.
- `CONNECTOR-AUDIT-1` — Every catalog app is now mapped to its operations, availability, credential, resource-picker, executor, and production-proof boundary in `docs/20-connector-audit.md`. The available HTTP node now exposes runtime headers through a reusable key/value Inspector field; roadmap-only nodes remain disabled. Web catalog tests 20/20, full quality gate, and Playwright 38/38 passed without provider calls.
- `CONNECTOR-FIELD-UX-1` — Google Drive hides upload-only fields until `uploadText` is selected, and Google Sheets uses a reusable table editor that preserves the existing matrix runtime payload. Web catalog tests 21/21, Playwright 39/39, and the full quality gate passed without provider calls.
- `CONNECTOR-CONTRACT-1` — Shared executable node capabilities now align the UI catalog and execution boundary while preserving schema-only roadmap imports. Web 22/22, API 198/198, Playwright 39/39, and the full quality gate passed without provider calls.
- `WEBHOOK-UI-POLISH-1` — Resource pickers separate search/select/manual entry and webhook setup is reachable from the selected trigger with published-version and multiple-draft safeguards. PR #31 is merged into this branch; the recorded report and full quality gate provide the evidence. No live provider webhook was used.

## Next approved slices

These are the only currently approved follow-up directions. A task must target
one of these IDs or explicitly reopen a completed ledger slice.

| ID | Outcome | Status | Owner/evidence boundary |
|---|---|---|---|
| `OPS-1` | Complete the VPS production qualification evidence: DNS/TLS, env shape, backup/isolated restore, rollback, and fixed-target smoke | operator-gated | Requires operator access and must not print secrets |
| `LIVE-1` | Validate one explicitly approved real Steam → Google Chat run plus configured OAuth callbacks | owner-input-required | Requires user credentials and explicit external-side-effect approval |
| `GH-PICKER-OWNER-1` | Clarify GitHub repository ownership and values not present in loaded results | pending | PR #32 is open; it is not included in this branch |
| `GH-HOOK-AUTO-1` | Automatically manage GitHub repository webhooks using the owner's connector credential | pending | Preserve manual registrations, explicit ownership, version safety and recovery after partial failures |

## Closed boundary

The following are not next implementation goals because they are already
implemented and verified in the repository ledger: authentication and identity
readiness, workspace/dashboard/workflow lifecycle, editor and node library,
credential lifecycle and dependency references, execution engine and worker qualification, node debug,
Go Live/activation guards, execution center, notification adapters, theme and
Relay-inspired design system, accessibility hardening, CI/CD, immutable image
deployment, release security contracts, production release candidate
documentation, dense-canvas navigation/minimap, and the reusable provider
resource-picker foundation.

## Non-negotiable loop

```text
read this state → select one non-closed ID → define proof
→ implement one vertical slice → run agent:task:check
→ run npm run verify → review diff and CI → merge only with owner approval
```

If no item can proceed without credentials, operator evidence, or a product
choice, report that blocker instead of inventing another feature or repeating a
completed slice.
