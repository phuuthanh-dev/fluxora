# Task contract

## Identity
- Task ID: `2026-11-04-steam-action-discovery`
- Base commit: `10c79afa6db3113434fe5b2df614da90a81fd1ec`
- Working branch: `develop`
- Implementer/reviewer: Codex

## Outcome
Show each existing Steam operation in the app library, selecting its configuration and label while retaining the existing runtime node and saved graphs.

## Target slice IDs
- `APP-EXPANSION-1`

## In scope
- Library discovery, search, favorites, recent actions, drag/drop, editor labels, graph reload, tests and documentation.

## Explicitly out of scope
- New Steam provider operations, migrations, credential changes or live provider tests.

## Acceptance criteria
- Steam's seven operations and snapshot are independently discoverable and create the correct existing node config.
- Saved nodes, legacy favorites, drag/drop and custom labels remain usable.
- Verify locally before the established PR/merge workflow.

## Safety boundaries
- Preserve real credentials and workflows; no live provider actions.
