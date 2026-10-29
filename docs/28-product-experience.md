# Product experience refinement

Owner request, 2026-10-29: release the public website, then improve the authenticated interface. This explicitly reopens L13.1; it does not reimplement the completed runner, connector or design-system slices.

## Audit and choices

The before screenshots are retained outside Git in `../previews/product-refresh-before-2026-10-29/`. The workflow list followed a large creation form. Connections opened with a dominant JSON editor before saved accounts, and several operational labels were 9–11px. The account menu still appeared in a screenshot taken after Escape.

The refined dashboard puts existing workflows before creation. The primary New workflow button moves focus to the creation area; the execution center remains collapsed by default. Connections present saved accounts, app icons and name/provider search first, with explicit loading, retry, empty and no-results states. New connection opens a separate, reversible GSAP Collapse; an empty workspace starts with it available. The compact editor manager uses the same implementation.

This follows the established separation of managing credentials, choosing an app and configuring its authorization, rather than inventing another global navigation layer. Reference reviewed: [n8n credential creation and editing](https://docs.n8n.io/build/understand-workflows/create-and-edit-credentials.md). Fluxora does **not** claim n8n's automatic provider connection testing: saving here encrypts and validates the payload locally at the API boundary.

## Reusable contracts

- `CredentialSecretFields` edits **new draft values only** for Steam, Google manual token, Google Chat, Discord, Telegram, GitHub and SMTP. Tokens/passwords/webhook URLs are masked. Steam IDs stay strings. SMTP transport selects numeric 587/465 values. HTTP's flexible authentication remains explicit JSON.
- Edit JSON is an advanced escape hatch. Switching between fields and JSON preserves additional properties. Invalid JSON cannot silently become an empty object. Rotation starts with a blank template; stored secrets are never fetched or revealed. Server validation, references, deletion blocking and managed Google OAuth behavior are unchanged.
- `CredentialManager` is keyed by workspace and ignores stale/unmounted list responses. Search, new secrets and inline action state reset when the workspace changes.
- `Menu` has a single React-controlled open state; its content is mounted only while open. The prior native toggle/React state synchronization is removed. Escape, outside pointer, blur, arrow navigation and focus return keep the shared behavior and GSAP surface entrance.
- `DialogHeader` centralizes title, eyebrow, divider and accessible close control for workflow commands and execution confirmations. Existing focus traps remain responsible for keyboard interaction.
- The inspector uses the existing provider icon, readable section titles and semantic form colors. React Flow remains the sole owner of canvas coordinates and handles.
- Gilroy, the lime brand, dark/light semantic tokens and existing components remain the foundation. Operational metadata is at least 12px where revised; display type stays separate from controls. No new animation framework or layout engine is added.

## CSS ownership

`design-system.css` owns shared dialog/menu recipes. `product-shell.css` owns navigation/auth composition. Existing composition rules in `globals.css` are adjusted in place. New credential search/guided-field composition lives beside the feature in `credentials.css`; it must not define a second palette. Landing animation, shader resources and public page layout are unchanged in this refinement.

## Validation boundary

Use synthetic local accounts. Cover JSON round trips, masked input, exact Steam ID preservation, SMTP selection, list/search/empty states, workspace isolation, repeated menu dismissal and dialog focus restoration. Retain existing credential lifecycle and mock workflow E2E. Review dashboard, connections, executions, editor and dialogs in both themes and supported widths. Run the full repository gate.

Public release and local product implementation are separate receipts. Do not infer production stability, OAuth approval or provider delivery from UI tests. No database/schema/infra changes belong to this refinement.
