# Shared node configuration schemas

## Identity
- Task ID: `2026-11-05-steam-snapshot-validation`
- Base commit: `ff33a43`
- Working branch: `codex/nx-validator-steam`
- Implementer and reviewer: Codex

## Target slice IDs
- `APP-EXPANSION-1`

## Outcome and scope
- The owner explicitly authorized shared node schemas and project-wide standardization after the validator-only direction. Keep one current node implementation and migrate by provider family; do not claim an unmigrated node is covered.
- First migrate Steam Snapshot configuration checks into shared contracts and use them in editor, publish-time literal checks, and resolved mock/live execution. Keep draft saving and real provider authorization separate.
- Reject non-boolean snapshot options and invalid App IDs; reject invalid or unresolved Steam operation, account ID, owned-games options and achievement language rather than silently choosing defaults. Omitted optional values retain their defaults.
- Add synthetic regression coverage, including unresolved expressions and proof invalid configuration makes no provider request. Preserve provider-specific checks that cannot be represented by a static schema.
- No node V1/V2, production provider calls, credential changes, or unrelated runtime settings. Leave the stopped retry/timeout branch untouched.
- Continue migration and audit before one final verify and release batch, as requested by the owner.
- A configuration entry now exists for each of the 84 executable types. This is an inventory, not proof of complete validation: nested relational constraints, cron parsing, authentication and provider protocols remain in their existing backend validators. Drafts remain editable and invalid literal configuration is checked at publish; dynamic values are checked after resolution.
- Owner subsequently requested an audit of the Gemini/OpenAI setup UI. Both use the same structured-output control: constrain its checkbox despite the generic input rule, separate the helper text, and remove the repeated visual field heading. Check both themes and providers in the final E2E batch; no tests have run yet.
