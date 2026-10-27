# Node Library Information Architecture

## Decision

Fluxora uses one workflow editor and one execution engine. “Developer & DevOps”,
“Notifications”, and similar labels describe discovery filters and workflow
templates; they are not separate workflow types.

The Add Node experience follows the connector model used by mature automation
products:

```text
Core workflow nodes
  → Trigger / Flow control / Human in the loop

Apps and services
  → App / connector
    → Trigger, action, search, or utility operation
      → Reusable encrypted connection when required
```

Examples:

```text
GitHub → Pull request opened
GitHub → Issue opened
GitHub → Create issue
GitHub → Add label
GitHub → Add comment
GitHub → Merge pull request
Telegram → Send message
Google Sheets → Read or write rows
```

## Product vocabulary

| Term | Meaning |
|---|---|
| Core node | A built-in workflow primitive such as Manual Trigger, If/Else, or Approval. |
| App / connector | A third-party service or integration family such as GitHub, Telegram, or Google Sheets. |
| Operation | One concrete trigger, action, search, or utility exposed by an app. |
| Connection | An encrypted, reusable provider credential owned by a workspace. |
| Template | A complete starter workflow grouped by use case tags such as Personal or Notifications. |

The persisted graph continues to store stable node type identifiers. App,
operation, category, aliases, and presentation metadata live in the source-owned
node registry. Changing discovery metadata must not invalidate an existing draft,
published version, or execution snapshot.

## Node Library behavior

The default library contains:

1. Search across app name, operation name, description, node type, aliases, and
   discovery category.
2. Recently used operations and favorites stored as browser preferences for the
   personal MVP.
3. Core workflow nodes grouped by Start, Flow control, and Human in the loop.
4. App cards filtered by Communication, Productivity, Developer & DevOps, Data,
   AI, and Social.
5. An app detail view that lists its operations by Trigger, Action, Search, or
   Utility.
6. Planned apps and operations that remain discoverable but cannot be added or
   executed.

Search is the primary discovery path. Categories are mutable metadata and must
not become persisted workflow semantics. A connector with many operations still
occupies one app card in the top-level library.

## Canvas and Inspector behavior

- A canvas node shows the app name and concrete operation where available.
- Core nodes retain their workflow role label.
- The Inspector configures one operation; it does not expose a generic provider
  mode switch that changes a node into a different operation.
- Connection selectors show only credential providers declared by the selected
  operation.
- Destructive operations may require a future policy or Approval node, but this
  library redesign does not introduce new provider calls.

## Persistence and rollout

- Existing workflow node type IDs remain unchanged.
- App and operation registries are source-controlled TypeScript for the MVP; no
  database catalog or connector marketplace is introduced.
- Recent and favorite operation IDs use `localStorage`; server synchronization is
  deferred until multi-device preferences become a demonstrated need.
- Template tags are returned by the existing read-only system-template API.
- Runtime connectors, OAuth scopes, credentials, and provider calls remain
  separate vertical slices. The current GitHub slices implement `GitHub → Create
  issue`, `GitHub → Add label`, and `GitHub → Add comment`, with a
  workspace-owned encrypted connector credential. The `GitHub → Issue opened`
  and `GitHub → Pull request opened` triggers verify signed webhook payloads with the connector's encrypted
  `webhookSecret`. Create issue also has an
  optional connector-level idempotency guard. Merge pull request remains an
  explicitly destructive live operation behind the existing run confirmation.
  GitHub account sign-in is an independent identity flow and is not reused by
  workflow execution.

## Acceptance criteria

- A user can add every existing available node through Core or App → Operation.
- Search finds an operation by app, operation, category, alias, or stable node
  type.
- Recent and favorite operations survive a page reload in the same browser.
- Planned operations are visible but disabled.
- Existing workflow JSON loads, saves, publishes, and executes without migration.
- Keyboard focus, light/dark contrast, drag-to-canvas, and narrow desktop behavior
  remain covered by automated checks.
