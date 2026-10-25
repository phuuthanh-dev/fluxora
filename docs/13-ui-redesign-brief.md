# UI/UX redesign brief and delivery plan

**Decision date:** 2026-10-25

## Brief

Redesign Workflow Automation into a coherent desktop-first control plane that feels clear on first use, credible in a portfolio demo, and efficient during repeated workflow operations. The redesign must improve hierarchy and interaction feedback without changing workflow semantics, credential boundaries, or execution safety.

The visual direction is **operational calm with Relay-inspired character** and
is now concretized in `apps/web/src/app/design-system.css` plus the migration
overrides in `apps/web/src/app/globals.css`:

- dark navigation and command surfaces communicate system control;
- a light, high-contrast canvas keeps workflow graphs readable;
- acid-lime is the product primary action and focus color;
- amber identifies live external side effects and approval attention;
- provider marks retain recognizable brand colors;
- motion explains state changes and hierarchy, never delays work.

Relay is a reference for typography, contrast, token discipline, and tactile motion. It is not the information architecture for the authenticated application. Marketing-only WebGL, smooth scrolling, and large storytelling layouts remain outside the dashboard and editor. The light canvas is an intentional product adaptation for graph readability; the shell and overlays use the near-black/lime foundation.

### Shell rule

Every authenticated route uses one `AppShellHeader`: product home, selected
workspace, Dashboard/Connections/Executions navigation, a persisted initials
avatar/account menu, theme, and
sign-out. The workflow editor intentionally adds a second, shorter
`EditorToolbar` directly below it for workflow-local operations only (save,
publish, test/live run, undo, graph actions). A global navigation action must
not be duplicated in that toolbar. This separates *where the user is* from
*what they can do to this workflow* without making either surface disappear.

## Primary users and jobs

The MVP owner must be able to:

1. understand runtime and workspace status from the dashboard;
2. find, create, filter, and open a workflow;
3. assemble a graph without learning internal node types;
4. configure credentials without exposing or confusing secret values;
5. distinguish save, publish, test, and live execution;
6. see progress, errors, input, and output without hunting across panels.

## Experience architecture

### Dashboard

The dashboard is the product home, not a workflow modal. It should contain:

- persistent product/workspace navigation;
- a compact runtime-health summary;
- workflow search, status filters, and sort;
- a primary create action with template choice as a secondary path;
- workflow cards/rows with draft, published, live, and last-run state;
- recent executions and actionable failures after the workflow list is stable.

### Workflow editor

The editor follows a three-region model:

```text
Node Library (optional) | Canvas (owns remaining space) | Inspector
```

- Collapsing the Node Library must remove its grid track and give all reclaimed width to the canvas.
- The inspector remains stable so configuration fields do not jump horizontally.
- The shared shell owns product/workspace navigation; the editor toolbar owns edit operations, workflow management, persistence, and execution.
- Test and live execution must remain visually and semantically distinct.
- Canvas overlays must not cover nodes, minimap, controls, or each other at supported desktop sizes.

### Credentials and executions

- Credentials are managed on a dedicated dashboard surface in the target design; the editor may link to that surface and provide contextual selection.
- Existing secret values are never redisplayed. Rename, rotate, reconnect, and delete are explicit separate actions.
- Execution detail uses a stable summary followed by node timeline and JSON tree/table/raw views.

## Design-system contract

### Foundations

- Tailwind CSS v4 and CSS variables provide tokens.
- Existing CSS is migrated incrementally, not rewritten in one change.
- Lucide handles product concepts; offline provider icons handle brands.
- Typography uses a readable sans family for product UI and monospace only for IDs, expressions, logs, and JSON.

### Shared primitives

Build these before broad page restyling:

1. Button and IconButton with primary, secondary, ghost, danger, and live variants.
2. Menu and DropdownMenu with consistent grouping and keyboard behavior.
3. Field, Select, Textarea, Checkbox, validation message, and help text.
4. Dialog and Drawer with focus management and responsive sizing.
5. Badge, StatusDot, EmptyState, Skeleton, Progress, and Toast.
6. Card, SectionHeader, PageHeader, and Toolbar.

### Interaction states

Every interactive surface must define default, hover, focus-visible, active, disabled, loading, success, and error states. Async operations expose a textual status and `aria-live` feedback. Animations respect `prefers-reduced-motion`.

## Debrief of the current UI

### What is already strong

- Dashboard and editor are separate routes.
- Editor actions are grouped into Edit and Manage menus.
- Node Library groups nodes by user purpose and supports search/filtering.
- Runtime readiness, progress, validation, loading, and provider icons exist.
- Execution input/output supports JSON tree, table, and raw views.
- Credential lifecycle and live-run confirmation have real safety behavior.

### What remains inconsistent

- Component styling is mostly page-specific CSS, so buttons, panels, and form controls drift.
- Dashboard, editor chrome, credentials, and overlays now share the App Shell; the remaining migration work is finer page-level spacing/type/elevation consistency.
- Credentials had behaved only like an editor utility panel. A workspace-scoped Connections page now reuses the same credential manager; the editor keeps a contextual panel and links out to the full surface.
- Execution history had only appeared as a compact dashboard section. A dedicated workspace-scoped Executions page now supports loading, empty, failure, filtering, pagination, and immutable execution inspection.
- The inspector disappears at a breakpoint rather than becoming an intentional drawer.
- Several overlay panels use duplicated CSS and have no shared dialog behavior.
- Responsive and reduced-motion behavior need explicit regression coverage.
- The editor's grid previously kept three columns after the Node Library was removed, shrinking the canvas to the old palette width. This slice fixes and tests that defect.

## Delivery roadmap

### R0 — Layout integrity and design contract

- Fix collapsible editor regions.
- Record this brief and the visual/interaction rules.
- Add browser regression proof for layout changes.

### R1 — Tokens and primitives

- Define semantic color, spacing, type, radius, elevation, and motion tokens.
- **Complete locally in this slice:** global Relay-inspired color, surface, radius,
  shadow, and motion tokens plus reusable CSS recipes are available in
  `docs/14-design-system.md` and `apps/web/src/app/design-system.css`.
- Implement the shared primitives listed above.
- Add a local component showcase route or development story surface.

### R2 — Dashboard redesign

- **Complete locally:** `AppShellHeader` provides persistent workspace-aware navigation on Dashboard, Connections, Executions, and Editor; it owns account/theme/sign-out behavior once rather than duplicating it per page.
- Rebuild workflow list/search/filter/create hierarchy.
- Consolidate runtime health and recent execution status.
- Preserve current workspace race protection and failure retries.
- **Complete locally:** an empty workspace has an explicit three-step onboarding
  path, a recommended Steam daily report template with its initial node flow,
  and a blank-workflow action that focuses the shared creation form instead of
  duplicating it. This keeps first-run guidance contextual and the creation
  contract in one place.

### R3 — Editor shell redesign

- Migrate the command bar, Node Library, canvas overlays, and inspector to primitives.
- **Complete locally:** `EditorToolbar` is visually separate from the shared App Shell and contains only workflow-local commands.
- Make left and right regions independently collapsible.
- **Complete locally:** at narrower desktop widths, selecting a node opens an intentional inspector drawer; it has backdrop/Escape controls, a focus trap, and focus return to the Inspector trigger.
- Standardize save/publish/test/live progress and confirmation states.
- **Complete locally:** editor node cards now preserve compact visual density while
  ports expose a 38×38px pointer target (44×44px during a connection), and the
  Inspector separates Setup, Configuration, Test & debug, Advanced, and Last
  execution into labeled reading regions.

### R4 — Credentials and execution management

- **Complete locally:** dedicated workspace routes exist at `/dashboard/connections` and `/dashboard/executions`.
- **Complete locally:** the Connections page reuses the credential manager rather than duplicating vault behavior; the editor links to it while retaining contextual selection.
- **Complete locally:** the Executions page exposes independent loading, empty, error/retry, filter, cursor-pagination, and immutable-inspection states.
- Continue to improve provider compatibility labels and lifecycle actions as each new provider is introduced.

### R5 — Motion, accessibility, and purchased Relay audit

- Add restrained spring motion only where CSS transitions are insufficient.
- Keep visible focus styles in every shared form/action primitive; test keyboard navigation, focus return, contrast, zoom, and reduced motion as routes are migrated.
- After Relay is purchased, inspect its real manifest and license before importing any source component.

## Acceptance rules for every redesign slice

- One user-visible outcome per slice.
- No change to published-version or credential security semantics unless separately specified.
- Keyboard and focus-visible behavior must remain usable.
- Loading, empty, error, disabled, and success states must be addressed where applicable.
- Add narrow regression coverage and run `npm run verify`.
- Visually inspect the changed route at desktop width before committing.
