# Connector field contract parity

## Identity

- Task ID: `2026-10-28-connector-field-contract`
- Base commit: `25f94b0`
- Working branch: `codex/connector-config-audit`
- Implementer/reviewer: `Codex and human owner`

## Outcome

Keep simple connector fields on the shared inspector contract while preserving
bespoke controls only where provider interaction genuinely needs them.

## Target slice IDs

- `CONNECTOR-CONFIG-2`

## In scope

- Represent Steam credential, account ID, optional achievement app ID, and
  boolean data scopes through reusable catalog field metadata.
- Render boolean field metadata through the shared inspector path.
- Preserve existing node types, config defaults, saved graph values, and mock
  execution behavior.
- Add a catalog regression test and update connector audit evidence.

## Explicitly out of scope

- Adding unsupported provider credentials or claiming roadmap nodes are live.
- Replacing Telegram destination controls, approval controls, or webhook setup;
  these remain bespoke because they have conditional guidance and lifecycle
  semantics.
- Provider calls, migrations, deployment, or external writes.

## Acceptance criteria

- [x] Steam simple fields render from shared configuration metadata.
- [x] Existing Steam defaults and saved graph keys remain unchanged.
- [x] Focused web tests and typecheck pass.
- [x] Full repository gate passes before commit.

## Required evidence

- `apps/web/src/features/workflow/workflow-graph-schema.test.ts`
- `npm run agent:task:check -- .agent/tasks/2026-10-28-connector-field-contract.md`
- `npm run verify`

## Safety boundaries

- Do not read, print, commit, or request real provider credentials.
- Do not call a provider, deploy, merge, or alter CI secrets.
