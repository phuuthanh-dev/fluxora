# Webhook registration version correctness

## Target slice IDs

- `WEBHOOK-VERSION-UX-1`

## Outcome

The registration panel must describe the published trigger that the server
will use, even if the editable draft differs. It must identify an endpoint
pinned to an older published version, and prohibit creating or rotating an
endpoint when the published graph has no webhook trigger.

## Proof

Browser regression tests exercise both divergent draft/published graphs and
the stale registration warning; the full quality gate must pass. All provider
requests are mocked and no live endpoint is modified.
