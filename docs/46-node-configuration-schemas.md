# Shared node configuration schemas

Owner direction, 2026-11-05: standardize node schemas across the project. Keep
one current node implementation, migrate provider families incrementally, and
run the final verification after the batch. Existing workflows may need fixes;
do not delete stored data or introduce V1/V2 nodes for compatibility.

## Boundaries

- `packages/workflow-contracts` owns shared configuration rules and safe field
  messages. The web can show those messages; the API is the authority.
- Keep one schema file per provider family under `node-config-schemas/`, with a
  small central lookup in `node-config-schema.ts`. Split an individual provider
  by operation only when its file becomes difficult to navigate. Shared types
  describe the validation contract; they do not contain provider logic.
- Drafts can remain incomplete. Static publish checks defer expressions; after
  resolution the runtime checks their actual values before provider requests.
- Schema checks neither replace provider authorization, outbound policy,
  operation-specific safety checks, redaction, nor establish provider support.
- Do not coerce a string into a boolean or number. An absent optional setting
  can use its existing default; an explicit unresolved value must not silently
  become that default. Do not emit configured values in validation messages.
- Inspector controls and provider resource discovery remain purpose-built.
  Metadata describes output; it is not yet a complete output validation schema.
- A node missing from the migrated configuration registry is **not** covered by
  it; its existing adapter validators still apply. Do not advertise all nodes
  as schema-validated until they have been individually migrated and verified.

## Released in PR #91

Steam Snapshot, Steam operation, MongoDB Find/Insert, Gemini, OpenAI, HTTP,
Google Chat webhook/OAuth send/reply/edit, GitHub actions, RSS Read, Reddit
List Posts, SMTP, Sentry and Vercel read actions and the Drive file/folder
actions, Telegram messages, Trello cards, Notion, Gmail, Calendar, PostgreSQL,
Supabase, Riot LoL/TFT, Discord, triggers, conditions, approval and the main
Drive/Sheets nodes are the current migrations.
Their configuration rules drive publish-time literal checks and resolved
execution; supported inspector controls also display the corresponding field
errors. Custom controls do not necessarily display every schema error yet.
Steam operation-specific fields are checked only for the selected operation; a
dynamic operation is checked after it resolves. Their existing provider adapters
still own credentials, responses and transport. MongoDB additionally rejects an
unresolved filter rather than turning it into an unfiltered read. AI schema
checks do not replace operator limits or provider model validation. GitHub's
conditional issue update checks only its selected field. PR #91 passed its PR
and main quality gates and the production deployment. Synthetic verification
does not establish provider permissions or live behavior.

The registry currently contains entries for 84 of 84 executable node types. This
is a source inventory, not a test result or a claim of full field coverage.
The existing provider validators remain in use. PostgreSQL and Supabase
schemas check the top-level selection; detailed filters, values, SQL safety and
precision remain enforced by their existing server-side validators. Cron syntax,
webhook authenticity and trigger-specific protocol rules also remain enforced
by their server-side validators.

### Google validation correction — merged in PR #92

The PR #91 rules accepted whitespace-only spreadsheet IDs, Sheets ranges and
Drive text-download file IDs. Synthetic mock executions also succeeded with
those values. The follow-up rejects blank-only selections at static and
resolved validation, while preserving expressions and nonblank ranges that
contain spaces. Two focused API test files passed 27/27 using synthetic data;
the final isolated verify and PR #92 and main quality gates passed; production
deployment succeeded on attempt 2 after an owner-approved image cleanup. This does not validate every
possible provider resource ID or establish access to a live Google account.

Each further family must enumerate its supported operations and conditional
fields from the actual adapter before migration, preserve expression behavior,
and include synthetic cases for valid/invalid inputs, provider non-invocation,
and any corresponding UI or publish behavior. Planned nodes remain disabled.
Retire redundant checks only after the same behavior has been demonstrated.

## References

- [n8n standard node parameters](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/base-files/standard-parameters/) and [programmatic node options](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/base-files/programmatic-style-parameters/) describe node configuration and dynamic resource loading; they do not imply that Fluxora has identical internals.
- [Zod basic usage](https://zod.dev/basics) documents schema parsing and safe error handling. Zod is already used in Fluxora web; shared contracts now declare it directly for the local migration.
