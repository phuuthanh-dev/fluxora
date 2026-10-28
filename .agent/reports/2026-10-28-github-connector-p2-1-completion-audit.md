# P2-1 GitHub connector completion audit

## Decision

- Status: `complete locally`
- Audited implementation through: `17a98fc351d6b77b64e934b3a8e46ebd3b58a3f4`
- Branch: `codex/github-connector-p2-1a`
- External boundary: no real GitHub credentials or provider calls were used in automated tests; owner-approved live smoke remains separate.

## Requirement evidence

| Requirement | Evidence | Result |
|---|---|---|
| Separate GitHub connector credential in the vault | `GITHUB` credential provider, encrypted credential service, workspace ownership checks, and credential UI explicitly separate connector credentials from GitHub login OAuth | complete |
| Mock Create Issue | L11.6 and `.agent/reports/2026-10-27-github-create-issue.md`; deterministic result and zero provider calls are tested | complete |
| Guarded live Create Issue | Backend uses only the fixed GitHub API host, server-side connector token, timeout/error classification, normalized result, and existing explicit live-run confirmation | complete locally; real smoke owner-approved |
| Readiness and safe errors/retry | Live readiness maps GitHub action/trigger nodes to `CredentialProvider.GITHUB`; shared retry/error contract tests authorization, rate-limit, server, timeout, and network cases | complete |
| Create Issue idempotency | L11.7 and `.agent/reports/2026-10-27-github-idempotency.md`; bounded key, hashed marker, lookup-before-create, and no-provider-call invalid paths | complete |
| Extended GitHub operations | L11.8–L11.10 cover Add Label, Add Comment, and Merge Pull Request with separate discoverable nodes, mock/live-guarded execution, normalization, validation, and retry classification | complete locally |
| GitHub triggers in the acceptance boundary | L11.11–L11.14 cover signed Issue opened, Pull request opened, Push, and Workflow run completed triggers on the published endpoint lifecycle | complete locally |
| Credential/signature safety | Raw-body HMAC-SHA256 verification, timing-safe comparison, encrypted `webhookSecret`, redacted execution payloads, and no token logging are covered by API tests and security gates | complete |
| Repository quality gate | Latest full `npm run verify`: 148 API, 19 web, 29 Playwright; 0 failed and 0 skipped | pass |

## Deferred by explicit boundary

- GitHub webhook registration through GitHub's API is not part of the current acceptance boundary; operators configure the webhook URL/event selection in GitHub.
- Additional GitHub operations beyond the four specified actions remain roadmap work, not a missing P2-1 requirement.
- Real GitHub provider smoke requires the owner to explicitly approve an external side effect and provide/use a workspace connector credential through the application.
