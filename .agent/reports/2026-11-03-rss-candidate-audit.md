# RSS trigger candidate — coordinator audit

Date: 2026-11-03. Candidate: isolated, uncommitted worktree
`/private/tmp/fluxora-nx05-minimal-20261103`, compared with its snapshot
`/private/tmp/fluxora-nx05-minimal-baseline-20261103`. This is a source review,
not a test result. The candidate has not been integrated or enabled.

## Findings

1. **Lifecycle and deletion are incomplete.** The candidate refuses deletion
   of a workflow with RSS history, retains receipts indefinitely and copies up
   to 100,000 receipts into each newly published version. It has no global
   quota or reviewed cleanup/reset path. This can cause unbounded storage or
   leave an owner unable to delete their workflow. See candidate
   `apps/api/src/workflows/rss-trigger-lifecycle.ts` and
   `apps/api/src/workflows/workflow.service.ts`.
2. **Compatibility is narrower than the UI implies.** RSS graphs containing
   an approval node are rejected at delivery; live manual/debug and retry are
   also disabled. These are implementation limits, not an established
   product requirement. The candidate lacks a complete owner-facing workflow
   for those limits and needs a deliberate solution before claiming coverage.
3. **Feed support is overly restrictive.** The URL policy rejects all query
   strings, percent-encoded paths and redirects, and strips all query strings
   from item links. These restrictions can exclude valid public feeds and change
   article links. Review the existing guarded DNS/socket/redirect policy and
   explicitly balance usable URLs with protection against leaking secrets.
4. **Cross-process recovery is not yet qualified.** Receipt checks and worker
   claims are separate; credential deletion, publication/deactivation, queue
   dispatch and stale worker races need a coherent transaction/lease protocol.
   The candidate only recovers never-started queued executions and provides no
   exactly-once guarantee. The current worker lease limitation remains.
5. **Saving depends on DNS.** Draft creation and edits call DNS validation for
   an RSS URL. A transient network failure can prevent saving a draft; syntax
   validation and network validation need appropriate separate boundaries.

The candidate's baseline creates receipts for existing feed items, and its
poller checks lease, workflow version and item identity. Those are useful
building blocks, but do not resolve the findings above. Retain the worktree as
reference; do not apply its migration or open its gate until the coordinator
has corrected the implementation and completed the final isolated verification.
