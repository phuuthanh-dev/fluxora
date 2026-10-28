# Atomic webhook registration

Registration create/rotation and its audit entry now execute in one Prisma
transaction. When audit creation fails, the endpoint update rolls back rather
than replacing the signing secret while returning an error.

Focused service tests passed, and an isolated PostgreSQL instance with
synthetic records confirmed that an unavailable audit table causes rollback
and preserves the existing secret. `npm run verify` passed with 164 API, 19
web and 35 Playwright tests. No real credentials or endpoints were used.

The transaction does not solve a lost HTTP response after a successful
commit: the one-time secret can still be lost and require a further rotation.
This scenario requires a separate recoverable rotation design.
