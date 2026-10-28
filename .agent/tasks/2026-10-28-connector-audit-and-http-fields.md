# Connector audit and HTTP configuration contract

## Target slice IDs

`CONNECTOR-AUDIT-1`

## User-visible outcome

Audit every connector currently present in the catalog against the product
specification, executor, credential provider, resource picker, and test
coverage. Close the concrete available-node gap where HTTP headers exist in the
runtime contract but are only editable through Advanced JSON by providing a
reusable key/value field in the Inspector.

## Scope

- Add `docs/20-connector-audit.md` with an evidence-based matrix for all
  catalog apps and a clear implemented-versus-roadmap boundary.
- Keep provider-specific operation nodes and shared credentials; do not invent
  a generic notification node or enable schema-only nodes.
- Add a reusable key/value configuration field for HTTP headers.
- Add focused catalog/UI regression coverage and update the loop/state ledger.
- Do not call real providers, deploy, or change protected OPS files.

## Acceptance criteria

- Every app in `appCatalog` is represented in the audit matrix.
- The matrix identifies category, available operations, credential contract,
  resource picker behavior, executor status, and remaining production proof.
- HTTP Inspector exposes headers as a structured key/value editor and persists
  a JSON object accepted by the existing executor.
- Empty, add, edit, and remove header rows are deterministic and accessible.
- Existing workflow graphs and the Advanced JSON editor remain compatible.
- Focused tests and `npm run verify` pass.

## Reopen justification

This is a new approved audit slice requested after the GitHub webhook lifecycle
slice. It does not reopen or duplicate the completed GitHub connector slices.

## Evidence boundary

Provider calls remain mocked or absent. Live OAuth, webhook delivery, and VPS
qualification stay owner/operator-gated in the existing release documents.
