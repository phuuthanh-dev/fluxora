# GitHub repository owner filter

GitHub classic personal access tokens can list repositories visible through
the token, including repositories under organizations or other owners. The
resource proxy previously returned that list without explaining the owner
boundary, which made the UI look as if Fluxora had mixed accounts.

The proxy now returns safe owner names, accepts a validated case-insensitive
owner filter, and still keeps the token server-side. The picker exposes an
`All visible owners` selector, retains the manual/expression fallback and
current values, and documents that filtering does not change GitHub
permissions. It deliberately does not hard-code `ithelpdesk` or turn the
credential into an organization allowlist.

Focused API/controller and browser coverage was added. The full quality gate
passed with 172 API tests, 20 web tests, and 39 Playwright tests. No real
GitHub token, provider request, webhook mutation, migration, deployment, or
external write was used.
