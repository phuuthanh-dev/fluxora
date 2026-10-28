# Synthetic migration upgrade evidence

An isolated temporary PostgreSQL instance was initialized with the migrations
from base commit `6565a3c`. Synthetic records were inserted for a user,
workspace, active published workflow, legacy webhook endpoint, and GitHub
credential. The current branch migrations were then applied with Prisma.

Assertions passed for preserving the active workflow and published version,
the existing webhook hash and active state, a null registration signing secret
for the legacy endpoint, and unchanged synthetic credential ciphertext.
Inserting a saved view succeeded; duplicate names in the same user/workspace
and a nonexistent workspace were rejected by database constraints. The server
was stopped after the test.

This is synthetic upgrade evidence for this base commit, not an upgrade or
rollback test against a production copy. It does not validate real encrypted
credential decryption, real webhook deliveries, production data volume,
deployment configuration, or the production migration history.
