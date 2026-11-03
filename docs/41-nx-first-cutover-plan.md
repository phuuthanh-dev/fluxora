# NX first production cutover: decision and rehearsal plan

Status: **not executable yet; production release is NO-GO**. This document
describes the missing work, not permission to bypass the release guards. The
owner accepts a short maintenance window, not lost workflows, credentials or
unreconciled provider effects. Keep the existing production instance serving
traffic until the gates below have been met.

## Observed starting point

- On 2026-11-03, read-only inspection showed one API and one worker using
  image `3c9ac35560126d6f7240f428efe0734275896218`; PostgreSQL and Redis
  were running separately. Recheck all state immediately before any release.
- The NX deployment's fleet guard deliberately rejects this older image.
  Merely stopping, relabeling or removing its containers to bypass the check
  would not establish that API work has finished.
- The old API starts scheduler ticks without tracking their completion, and
  its bootstrap does not enable a graceful shutdown hook. Google OAuth refresh
  has a 20-second HTTP timeout, but this is not a bound on every request,
  background task, database commit or Redis operation. An observed empty queue
  or a fixed wait therefore cannot certify a clean API drain.
- The checked legacy source starts Cron and Gmail ticks, execution
  maintenance and provider-webhook recovery with untracked asynchronous calls.
  Execution events also publish asynchronously. Identify which are enabled in
  the real API process without disclosing its environment or credentials;
  fencing just Cron does not cover the others.
- An isolated mixed-worker experiment demonstrated an incorrectly completed
  approval continuation. A separate synthetic worker handoff and a restore
  into an empty database each worked for their stated fixtures; neither is a
  complete production cutover or rollback. See [the release review](40-nx-release-review.md).
- On 2026-11-04, read-only inspection showed production API and worker image
  ID `sha256:70f1b641233979f4476190f654757514c2433fd8399853087a9462637b729ce3`.
  The same AMD64 image was pulled and run under emulation with `--network none`.
  A synthetic HTTP server invoked the image's actual compiled
  `CredentialService.readGoogleForExecution` with fake vault, database and
  provider dependencies. After the client disconnected, a gated fake provider
  response was released and the method wrote the synthetic credential. This
  confirms that an HTTP disconnect alone does not complete that image's OAuth
  work. It is not a test of the image's Nest bootstrap, actual provider,
  production activity, shutdown signals or a complete cutover.

## Required design and proof

1. **Fence every producer.** Identify all API ingress paths, scheduler ticks,
   background producers, workers and any independent clients sharing the
   database or queue. Specify how to stop new work and how to observe completion
   of work accepted before the fence, including detached tasks and client
   disconnects. A passive proxy connection count is insufficient. Choose and
   implement a drain or a reconciliation mechanism for the legacy API; do not
   infer it from the NX drain label. Account for webhooks received and cron
   intervals missed during maintenance, without assuming provider redelivery.
2. **Drain and reconcile.** Rehearse with the exact old and target runtime,
   including in-flight HTTP, a pending OAuth refresh, scheduler activity,
   worker jobs, waiting jobs and approval continuation. Use synthetic providers
   and data. After the fence and drain, compare nonterminal execution state
   with queued jobs and investigate inconsistencies before migrating. A clean
   process exit or a momentary zero is not sufficient on its own.
3. **Establish recoverability.** Document a protected, restorable PostgreSQL
   snapshot, separately preserved encryption key and queue/side-effect
   reconciliation. Restore to an isolated empty database and prove selected
   workflows and credential ciphertext are usable with the matching key.
   Restoring into a populated database with `pg_restore --clean` can leave
   objects absent from the archive. A local guard refuses common signs of
   a populated target; an isolated PostgreSQL test passed for a table and a
   schema/function. The guard is not a complete
   PostgreSQL object comparison or a fence against other writers. Neither
   database restore nor image rollback reverses provider actions or restores
   all Redis jobs. The owner's
   earlier decision to postpone backups is not evidence of recoverability;
   do not claim rollback is available without a demonstrated alternative.
4. **Choose the failure boundary before migration.** Before schema changes,
   define how to restart precisely the original fenced processes and reconcile
   work. After migrations or NX writes, do not start the legacy worker against
   the live database/queue: new graphs, continuations and provider effects can
   be incompatible. The existing rollback script does not support reverting to
   `3c9ac35`. A snapshot restore can lose subsequent writes and needs a separate
   explicit owner decision if it would discard production data.
5. **Exercise interruption paths.** Rehearse migration failure, lost SSH/CI
   connection, process stop failure, partial startup and health-check failure.
   Establish which release lock remains held, who owns recovery and how an
   operator determines the actual state without starting competing workers.
   Record exact image IDs, migration state, queue observations and test results.
6. **Only then promote.** Review the exact `develop` head and final CI, align
   the runbook with the actual production topology and confirm the maintenance
   window. Merge can trigger automatic deployment: do not merge until the
   first-cutover mechanism is implemented, reviewed and exercised end-to-end.
   After release, check the exact API and worker images, health, queue and
   scheduled-work reconciliation; a healthy web page is not sufficient.

This plan does not establish an ETA, a provider compatibility guarantee, or a
complete rollback procedure. It intentionally leaves the fleet guard intact.
