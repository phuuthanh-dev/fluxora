# Production database recovery

The production PostgreSQL database stores workflows, executions and encrypted
connections. A copy of the deployment environment alone does not contain them.
The database archive and its matching `APP_ENCRYPTION_KEY` are both needed to
recover connections. Keep the key separately; never commit either file.

On 2026-11-12 a custom-format archive was pulled to the owner's Mac and
restored into a disposable PostgreSQL 16 container with networking disabled.
The restored snapshot contained 20 workflows, 17 credentials and 50
executions. This is an isolated database restore, not a full application or
credential-decryption rehearsal. The owner's previously saved environment
backup was checked to contain the same encryption key as the active API.

`infra/scripts/pull-production-backup.sh` streams a consistent PostgreSQL dump
over host-key-verified SSH to the backup machine, verifies that `pg_restore`
can read its table of contents and publishes the file atomically. It requires
`FLUXORA_BACKUP_HOST`, `FLUXORA_BACKUP_SSH_KEY`,
`FLUXORA_BACKUP_KNOWN_HOSTS`, `FLUXORA_BACKUP_DIR`, SSH and PostgreSQL client
tools compatible with the server. Backups include private data; restrict the
directory to the owner and store the matching environment separately.

On the owner's Mac the launch agent `vn.fluxora.production-backup` runs at
03:00 local time while the user session and network are available. Archives
are in `~/.local/share/fluxora/backups/production-daily`, with logs one
directory above. A sleeping, offline or logged-out Mac is not a continuously
available offsite backup target; inspect backup timestamps and logs regularly.
This does not provide independent disk-failure protection if the Mac and its
backup files are lost together. No automatic pruning is configured.

Before a real restore, protect the current database, restore to a separate
empty instance first, confirm the migration version and validate the matching
encryption key. Follow `infra/scripts/restore-postgres.sh` and the deployment
runbook; never point restore commands at the live database for a rehearsal.
