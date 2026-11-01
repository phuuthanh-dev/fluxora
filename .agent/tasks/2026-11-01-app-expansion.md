# App expansion and node discovery

## Identity
- Base: `f8ad9fc`; branch `codex/connector-catalog-expansion`.

## Target slice IDs
- `APP-EXPANSION-1`

## Outcome
Improve discovery as the catalog grows and implement separately reviewable
provider slices for Trello, Sentry, Reddit, RSS, Uptime Kuma, Vercel and Supabase.
Do not present a provider as ready until its end-to-end operation works.

## Acceptance criteria
- Apps are grouped using the existing categories and remain searchable.
- Each delivered integration has clear operations, provider-specific auth,
  server-side validation, bounded requests, tests and truthful availability.
- Preserve existing credentials and workflows. Live calls and deployment are
  separate from local mocked verification.

## Evidence
Update the expansion plan and agent state. Run focused checks and the full
quality gate at the end; refresh the code graph if imports change.
