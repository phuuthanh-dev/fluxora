# Notion and PostgreSQL initial connector slices

## Outcome

- Local initial operations completed; real-provider qualification, further
  operations, and deployment remain outstanding.
- Base `b5a831f`, branch `codex/notion-postgres-connectors`.
- Notion: separate integration-token vault connection and Search pages action.
  Searches only pages shared with the integration; response returns bounded IDs
  and titles, with an indicator when more pages exist. No create/update or OAuth.
- PostgreSQL: separate connection and Select rows action; owner-scoped schema and
  table pickers with manual/expression fallback, up to 100 rows, streamed output
  bounded to 200 KB, read-only transaction, DNS address pinning, verified TLS,
  parameterized metadata lookup and safe identifier validation. The initial
  connector supports public hostnames and simple identifiers; private hosts,
  custom SQL, filtering UI, inserts/updates and pagination are not implemented.
- Credential enum migration applies to both providers. No production migration
  was run. Mock runs do not retrieve credentials or contact providers.

## Validation

- Full `npm run verify` passed in an isolated worktree and synthetic local
  database: 274 API, 29 web and 132 Playwright E2E tests. The isolated
  Playwright setup changes only its temporary ports from 3000/3001 to 13460/13461.
- A temporary isolated PostgreSQL server with a synthetic certificate returned
  a fixture row over verified TLS and rejected a mismatched hostname. That
  temporary server was stopped. This test bypassed the public-host resolver
  solely to reach its loopback fixture; public/mixed address blocking was
  separately unit tested. No customer database or real provider was contacted.
- A separate tracked-file security scan passed after the new files were added
  to the temporary worktree index. The owner-authorized production PR #55
  quality run `41282544015` also passed; it remains a draft and was not merged.

## Follow-up

- Review and qualify with owner-designated Notion pages and a test database;
  verify permissions, bounded metadata behavior and provider errors. Do not
  collect secrets in chat.
- Run the migration and deploy only through an explicitly reviewed release.
- Extend Notion with page selection and create/update, and PostgreSQL with
  guided filters and explicit write operations after separate safety review.
