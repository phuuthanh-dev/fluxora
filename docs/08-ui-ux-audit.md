# UI/UX Audit and Improvement Plan

## Scope and baseline

This audit covers the desktop-first authenticated experience: sign-in, dashboard, workflow editor, node palette, canvas, inspector, overlays, credentials, execution feedback, and the supported narrow viewport layout. It is based on the running application and the latest editor review on 2026-10-24.

## Findings

| Area | Finding | Risk | Resolution in this pass |
|---|---|---|---|
| Header toolbar | Fifteen peer-level buttons consumed the entire header and hid the primary hierarchy. | High | Grouped related editing and management actions into two labelled dropdowns. Save, publish, and test run remain visible primary actions. |
| Workflow navigation | The editor opened as the only authenticated view, so workflow management was hidden behind a modal. | High | Replaced the initial route with a full dashboard: workspace switcher, workflow cards, live/draft state, blank/template creation, and direct editor links. |
| Live actions | A "Run" label did not make the mock-vs-live boundary clear enough for a production-ready automation UI. | High | Kept **Run test** deterministic and added amber **Go live**, disabled until publish, followed by a side-effect confirmation naming the pinned version. |
| Credentials | Provider selection did not update the label, secret template, OAuth call-to-action, or instructions. Nodes also required a manually copied credential ID. Buttons inside overlays lacked shared button sizing. | High | Added provider-specific presets and hints; Google OAuth is visible only for Google; nodes now offer compatible saved connections by name; applied consistent controls and focus states. |
| Credential form errors | Invalid JSON appeared only as a generic panel notice and a repeated submit could create duplicate connection records. | High | JSON is validated inline with `aria-invalid`/alert feedback; save is disabled while encryption is in flight. |
| Workflow nodes | Output labels were rendered from overlapping absolute positions, colliding with node copy and handles. | High | Each output label now has the same calculated vertical position as its handle; wider nodes reserve space for the labels. |
| Async feedback | Editor loading was a small status message; save/publish/run offered ambiguous or no continuous progress. | High | Added an accessible loading card, operation-specific labels, spinner, and a visible progress strip. |
| Empty inspector | The blank inspector did not establish a visual hierarchy or clearly explain its next action. | Medium | Strengthened the empty-state icon treatment and retained focused instructional copy. |
| System feedback | Canvas notices were visually useful but not announced to assistive technology. | Medium | Added live status semantics to canvas and operation feedback, and visible keyboard focus treatment for buttons and menus. |
| Motion | Existing transitions had no reduced-motion policy. | Medium | Added a `prefers-reduced-motion` override so progress/loading motion is optional. |
| Responsive layout | The MVP is desktop-first. At narrow desktop widths the inspector disappears, but the header and canvas need a dedicated compact-toolbar review. | Medium | Deferred deliberately; mobile is outside the MVP, while compact desktop remains next in the UX backlog. |

## Interaction model

1. **Edit** contains reversible canvas work: undo/redo, automatic layout, copy/paste.
2. **Manage** contains navigation and asset management: workflows, history, credentials, webhook endpoint, import/export, clone.
3. **Save draft**, **Publish**, **Run test**, and **Go live** are persistent, ordered by normal workflow progression. Go live is visually differentiated and cannot run until the workflow has a published version.
4. The dashboard is the first authenticated page. Workspace choice occurs there; the canvas is reserved for a selected workflow.
5. Nodes expose readable success/error/case ports without obscuring their title or description.
6. Every provider-specific secret form begins with a safe empty JSON template and a sentence explaining what belongs there. After saving, compatible nodes select the connection by name rather than requiring its raw ID. Secret values remain browser-visible only until submitted.

## Acceptance checks for this pass

- Browser E2E creates an account, opens the grouped Manage menu, opens Credentials, selects Steam, and verifies the Steam-specific label/template/help text and absence of the Google OAuth action.
- Browser E2E lands a new account on the dashboard, creates the Steam template, publishes it, and verifies that Go live reveals a side-effect confirmation rather than sending externally.
- Browser E2E still verifies that a Switch can be added and configured.
- The quality gate (`npm run verify`) remains mandatory after implementation.

## Follow-up backlog

1. Complete a manual keyboard/focus audit for every popover and side panel.
2. Add visual-regression snapshots for the editor at 1440px and 1280px widths, including a long workflow name and a selected multi-output node.
3. Add saved/unsaved-draft state and last-saved timestamp in the header.
4. Replace free-text operation fields in node inspectors with constrained selects where the schema has a fixed enumeration.
5. Introduce a compact desktop header breakpoint before any mobile layout work.
