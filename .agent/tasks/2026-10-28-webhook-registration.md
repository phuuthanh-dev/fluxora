# Webhook registration separation

## Target slice IDs

- `WEBHOOK-REG-1`

## Outcome

Generate an encrypted signing secret per GitHub webhook endpoint, preserve
legacy credential-secret verification, and guide the owner through manual
GitHub registration and explicit rotation in the editor.

## Proof and boundaries

- Unit tests verify registration secret storage and new/legacy delivery.
- Prisma migration adds a nullable field, with no automatic secret rotation.
- UI states that rotation immediately requires updating the external webhook.
- Run `npm run verify`; no real credentials or provider writes.

## Local evidence

- `npm run verify` passed: 154 API tests, 19 web tests and 30 Playwright tests.
- The migration is created but has not been applied to a live database.
- UI inspected in light and dark modes; real GitHub delivery remains unverified.
