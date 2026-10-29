# Development Rules

## TypeScript and modules

- Use TypeScript with `strict` enabled. Do not use `any`; use `unknown` plus a parser at untrusted boundaries.
- Prefer named exports. Keep one public responsibility per file.
- Keep shared domain types in `packages/workflow-contracts`; do not make the frontend import backend modules.
- Do not add a generic `helpers`, `common`, or `utils` dumping ground.

## API rules

- Version endpoints under `/api/v1`.
- Validate request data and node configuration with schemas.
- Return a stable error shape: `{ code, message, details?, requestId }`.
- Never serialize stored credential values, OAuth tokens, existing secrets, or sensitive headers. A newly generated webhook signing or header-auth secret may be returned only once to the authenticated workspace owner in a non-cacheable creation or rotation response; later reads must not return it, and it must never be logged.
- Make external calls only in backend executors.

## Frontend rules

- Prefer accessible semantic HTML and keyboard-operable controls.
- Keep graph state separate from server state.
- Forms must show inline validation and preserve unsaved input where practical.
- Node configuration must use the strongest appropriate control: static selects for bounded enums, searchable resource pickers for provider-owned resources, and expression-aware hybrid inputs for runtime data. Avoid free-text fields when the provider can safely enumerate the value.
- Provider resource pickers must load through an authenticated backend endpoint; the browser must never receive connector tokens or call provider APIs directly. Persist stable provider identifiers in workflow config, not display-only labels.
- Avoid animation that obscures workflow status or makes execution feel slower.
- When matching a motion reference, inspect temporal sequences and retain a
  local browser recording. Separate autonomous motion from page scrolling;
  screenshot review and passing E2E alone do not establish visual fidelity.
- Desktop-first does not mean inaccessible: layouts must remain readable at narrower widths.

## Workflow semantics

- Validate no cycles before saving/publishing.
- Do not mutate a published graph. Create a new draft version.
- An execution reads its pinned version only.
- Node output must be JSON serializable and redacted before persistence.
- Executor behavior must declare whether an error is retryable.
- Do not support arbitrary code execution without an explicit sandbox design and spec change.

## Testing

- Unit-test expression resolution, graph validation, branching, retry classification, redaction, and every executor.
- Integration-test the Steam-to-Google-Chat happy path with mocked HTTP transport.
- Test webhook secret validation and approval resume paths.
- Do not use real credentials in tests or fixtures.

## Git and documentation

- Keep commits focused and imperative.
- Do not commit `.env`, tokens, database volumes, screenshots containing secrets, or provider exports.
- Update product spec when behavior changes; update architecture when system boundaries change.
- New runtime node work must document its credential type, supported operations, output schema, retry policy, and mock fixture.
- New connector fields must document whether they are static, provider-enumerated, runtime-expression, or intentionally free-form, and must reuse the shared catalog field contract before adding a provider-specific inspector branch.

## Git branch policy

The remote repository keeps only `main` and `develop`. Work is committed on
local task branches, merged into local `develop`, verified, and then pushed as
`origin/develop`. Production changes use one pull request from `develop` to
`main`; task branches are never pushed or opened as pull requests.
